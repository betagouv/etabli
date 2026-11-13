Je décris ci-dessous un projet composé de {{websites.length}} sites internet et de {{repositories.length}} dépôt de code source, et je veux que tu m'en déduises certaines informations :

1. le nom de ce projet (nous pensons que c'est `{{{probableInitiativeName}}}`, n'hésite pas à corriger si ça te semble incorrect). Si ce nom n'est pas un vrai nom de projet ou d'organisme (un nom de domaine comme `www.exemple.fr`, ou un titre générique comme « Accueil »), renseigne `suggestedName` avec le vrai nom d'après le contenu (par exemple « Commune de Ballersdorf »), sinon mets `suggestedName` à `null`
2. les principaux cas d'utilisation métiers de ce que fait le projet (pas les choses fonctionnelles comme envoyer un email), ils doivent être décrit sous forme de phrase (exemple : "aide aux personnes âgés"), 10 mots maximum par cas, 1 seule idée par cas d'utilisation, et 4 ou 5 cas d'utilisation au maximum (mais il peut y en avoir moins si c'est suffisant)
3. une description de 100 mots maximum de ce que fait le projet (des mots métiers, ne pas aborder des choses techniques)
4. tous les outils qui sont des frameworks ou des services utilisables par une API. D'abord, déduis-les et trouve leur nom commercial tout en omettant celles qui semblent être des petites librairies, des protocoles, ou des polices d'écriture. Une fois que tu as la liste, si certains correspondent à la liste des outils passée dans le contexte, utilise le nom du contexte
5. `isPublicService` : `false` uniquement si le projet n'a clairement aucun lien avec un service public ou un organisme public, typiquement un domaine racheté qui sert désormais à du commerce privé (casino, paris, boutique de CBD, prêts, contenu pour adultes, référencement, page indiquant que le domaine est à vendre, annuaire d'entreprises sans rapport, articles génériques sans rapport avec l'organisme dont le domaine porte le nom, contenu dans une langue étrangère sans lien avec l'organisme...). Sinon `true`, même s'il vend quelque chose : une billetterie de musée, une boutique de régie municipale ou un office de tourisme restent `true`. Dans le doute, réponds `true`
6. `isServiceClosed` : `true` uniquement si le contenu indique clairement que le service ou le site est définitivement fermé, arrêté ou remplacé (par exemple « ce service a fermé », « application fermée », « fermeture définitive », « ce site n'est plus maintenu »). Une page en construction, une maintenance temporaire, ou la fermeture ponctuelle d'un lieu (horaires, jours fériés) restent `false`. Dans le doute, réponds `false`
7. pour chacun des cas d'utilisation fonctionnels ci-dessous (dans `functionalUseCases`), réponds `true` uniquement si le contenu fourni plus bas (texte du site, README, fonctions du code, dépendances) en montre une preuve explicite. N'utilise pas ce que tu sais par ailleurs de ce projet ou de projets similaires : sans preuve dans le contenu fourni, réponds `false`, même si c'est habituel pour ce type de projet (par exemple un site de mairie n'envoie pas forcément d'emails) :
   - `hasVirtualEmailInboxes` : génère à la volée des adresses email de réception (boîtes virtuelles)
   - `sendsEmails` : envoie lui-même des emails (confirmation, notification, lettre d'information...), une simple adresse de contact ou un lien `mailto:` ne suffit pas
   - `sendsPushNotifications` : envoie des notifications push (navigateur ou mobile)
   - `generatesPDF` : produit lui-même des fichiers PDF (attestation, export, rapport, document personnalisé), à la demande ou par un traitement. Proposer en téléchargement des documents PDF déjà existants ne suffit pas
   - `generatesSpreadsheetFile` : produit lui-même des fichiers tableur (CSV, XLSX, ODS), à la demande ou par un traitement (un script qui écrit ses résultats dans un fichier CSV compte). Proposer en téléchargement un fichier tableur déjà existant ne suffit pas
   - `hasSearchSystem` : propose un moteur de recherche dans son propre contenu ou ses données
   - `hasAuthenticationSystem` : permet aux utilisateurs de se connecter à un compte
   - `providesTwoFactorAuthentication` : propose une double authentification
   - `managesFileUpload` : permet aux utilisateurs de déposer des fichiers
   - `hasPaymentSystem` : permet de payer en ligne
   - `hasSeveralLanguagesAvailable` : son interface est disponible en plusieurs langues
   - `reportsAnalytics` : mesure l'audience ou l'usage avec un outil de statistiques
   - `reportsErrors` : remonte ses erreurs à un service de suivi (comme Sentry)
   - `displaysCartographyMap` : affiche une carte géographique interactive
   - `usesArtificialIntelligence` : utilise de l'intelligence artificielle (modèle de langage, apprentissage automatique...)
   - `exposesApiEndpoints` : expose une API utilisable par d'autres services

Base-toi uniquement sur le contenu fourni. Si ce contenu est trop pauvre pour savoir ce que fait le projet (par exemple un dépôt sans README ni description), ne déduis rien de son seul nom : décris seulement ce qui est observable et indique dans la description que les informations disponibles sont limitées.

Tu dois répondre en respectant les types suivants en les formattant au format JSON strict (et surtout, n'ajoute pas de commentaires ou de notes autour du JSON).

{{! we use comments in the json delimiter otherwise Prettier autoformats it as inline code with only 1 back quote  }}

```ts
{{! this Handlebars comment is needed so Prettier will not format weirdily the injection of the definition }}
{{{resultSchemaDefinition}}}
```

**N'inclus pas d'explication dans ta réponse. Ci-dessous tu trouveras toutes les informations à analyser :**

{{#each websites as |website|}}

---

{{> websitePartial website=website websiteNumber=(incrementIndex @index)}}

{{#unless @last}}

---

{{/unless}}
{{/each}}

{{#each repositories as |repository|}}

---

{{> repositoryPartial repository=repository repositoryNumber=(incrementIndex @index)}}

{{#unless @last}}

---

{{/unless}}
{{/each}}

---

IMPORTANT: toutes tes réponses doivent impérativement être écrites en français (que ce soit les propriétés `name`, `description`, et les entrées dans `businessUseCases`) !

{{#if messageToAppend}}
{{{messageToAppend}}}
{{/if}}
