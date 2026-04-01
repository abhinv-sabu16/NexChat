/**
 * config/apollo.js
 */

import { ApolloServer }                          from '@apollo/server';
import { ApolloServerPluginDrainHttpServer }     from '@apollo/server/plugin/drainHttpServer';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { makeExecutableSchema }                  from '@graphql-tools/schema';

import { typeDefs  } from '../graphql/schema.js';
import { resolvers } from '../graphql/resolvers/index.js';

export { buildApolloContext } from '../middleware/auth.js';

const IS_PROD = process.env.NODE_ENV === 'production';

export async function createApolloServer(httpServer) {
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  const server = new ApolloServer({
    schema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      IS_PROD
        ? ApolloServerPluginLandingPageDisabled()
        : ApolloServerPluginLandingPageLocalDefault({ footer: false }),
    ],
    introspection: !IS_PROD,

    formatError(formattedError, error) {
      // Log the REAL error to Render logs — this is what formatError was hiding
      console.error('[graphql] error:', error?.message);
      console.error('[graphql] stack:', error?.stack);

      if (IS_PROD) {
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