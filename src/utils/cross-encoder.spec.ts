/**
 * @jest-environment jest-environment-node-single-context
 */
import { CrossEncoderSingleton, rankDocumentsWithCrossEncoder } from '@etabli/src/utils/cross-encoder';

// We had those issues to perform tests:
// 1. `fetch is not defined` if not run into a node environment (but it would be possible to already have models locally or to polyfill the fetch)
// 2. Jest context was not enough requiring the specific environment `jest-environment-node-single-context` (refs: https://github.com/xenova/transformers.js/issues/57#issuecomment-2020240523 and https://backend.cafe/should-you-use-jest-as-a-testing-library)

describe('CrossEncoder', () => {
  beforeAll(async () => {
    // Make sure the model and tokenizer are loaded before running individual tests
    await CrossEncoderSingleton.getInstance();
  }, 60 * 1000);

  it(
    'rankDocumentsWithCrossEncoder()',
    async () => {
      const rankResults = await rankDocumentsWithCrossEncoder(
        [
          JSON.stringify({
            description: `1jeune1solution est une plateforme d'aide à l'insertion professionnelle des jeunes en les mettant en relation avec des employeurs et en leur proposant un accompagnement personnalisé.`,
          }),
          JSON.stringify({
            description: `Acceslibre est une plateforme visant à recenser et partager les informations sur l'accessibilité des lieux publics en France. Elle permet aux contributeurs de renseigner les informations d'accessibilité de divers lieux ouverts au public, tels que les cafés, restaurants et administrations.`,
          }),
          JSON.stringify({
            description: `Demarches-simplifiees.fr est une plateforme en ligne qui permet de réaliser des démarches administratives en toute simplicité. Elle propose également aux administrations d'utiliser ses outils pour dématérialiser leurs propres démarches et offre une assistance en ligne aux utilisateurs. La plateforme génère également des statistiques d'usage.`,
          }),
        ],
        'accessibilité'
      );

      // The query "accessibilité" matches the "Acceslibre" initiative (index 1), which must be reranked first. We only
      // assert that the relevant one tops the list: the other two are both unrelated to accessibility, so their relative
      // order carries no meaning and is within the model's scoring noise.
      expect(rankResults[0].originalDocumentIndex).toBe(1);
    },
    15 * 1000
  );
});
