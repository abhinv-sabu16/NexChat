/**
 * config/apollo.js
 *
 * Apollo Server 4 setup.
 * Extracted from index.js so the entry point is pure orchestration.
 *
 * Responsibilities:
 *   - Build executable schema from typeDefs + merged resolvers
 *   - Configure Apollo plugins (graceful drain, landing page)
 *   - Export context builder (buildApolloContext) for expressMiddleware
 */

import { ApolloServer }                          from '@apollo/server';
import { ApolloServerPluginDrainHttpServer }     from '@apollo/server/plugin/drainHttpServer';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { makeExecutableSchema }                  from '@graphql-tools/schema';

import { typeDefs  } from '../graphql/schema.js';
import { resolvers } from '../graphql/resolvers/index.js';

// Re-export so index.js only needs to import from config/apollo
export { buildApolloContext } from '../middleware/auth.js';

const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Creates and starts the Apollo Server instance.
 *
 * @param {import('http').Server} httpServer - The shared HTTP server.
 *   Passed to ApolloServerPluginDrainHttpServer for graceful shutdown.
 * @returns {Promise<ApolloServer>} Started Apollo instance
 */
export async function createApolloServer(httpServer) {
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  const server = new ApolloServer({
    schema,
    plugins: [
      // Drains the HTTP server before Apollo shuts down — prevents dropped requests
      ApolloServerPluginDrainHttpServer({ httpServer }),

      // Show Apollo Sandbox in development; disable entirely in production
      IS_PROD
        ? ApolloServerPluginLandingPageDisabled()
        : ApolloServerPluginLandingPageLocalDefault({ footer: false }),
    ],
    // Introspection: on in dev, off in prod (prevents schema leaking)
    introspection: !IS_PROD,

    // Format errors before sending to client — strip internal details in prod
    formatError(formattedError, error) {
      if (IS_PROD) {
        // Never leak stack traces or internal error messages to clients
        const safeMessage =
          formattedError.extensions?.code === 'INTERNAL_SERVER_ERROR'
            ? 'An internal error occurred.'
            : formattedError.message;

        return {
          message:    safeMessage,
          extensions: { code: formattedError.extensions?.code },
        };
      }
      return formattedError;
    },
  });

  await server.start();
  console.info('[apollo] GraphQL server started');

  return server;
}