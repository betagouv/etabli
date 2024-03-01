{{#if repository.functions}}
La liste des fonctions dans le code source du dépôt numéro {{repositoryNumber}} :

```
{{#each repository.functions}}
{{{this}}}
{{/each}}
```

{{/if}}

{{#if repository.dependencies}}
La liste des dépendances listés dans le code source du dépôt numéro {{repositoryNumber}} :

```
{{#each repository.dependencies}}
{{{this}}}
{{/each}}
```

{{/if}}

{{#if repository.readme}}
La liste du contenu du fichier `README.md` du dépôt numéro {{repositoryNumber}} :

```
{{{repository.readme}}}
```

{{/if}}
