## {{{name}}}

Identifiant unique : {{{id}}}
Description :

```
{{{description}}}
```

{{#if websites}}
Sites internet :
{{#each websites}}- {{{this}}}
{{/each}}
{{/if}}
{{#if repositories}}
Dépôts de code :
{{#each repositories}}- {{{this}}}
{{/each}}
{{/if}}
{{#if businessUseCases}}
Cas d'utilisation métiers :
{{#each businessUseCases}}- {{{this}}}
{{/each}}
{{/if}}
{{#if functionalUseCases}}
Cas d'utilisation fonctionnels :
{{#each functionalUseCases}}- {{{this}}}
{{/each}}
{{/if}}
{{#if tools}}
Outils utilisés :
{{#each tools}}- {{{this}}}
{{/each}}
{{/if}}
