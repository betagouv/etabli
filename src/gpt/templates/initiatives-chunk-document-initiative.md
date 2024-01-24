## {{name}}

Unique ID: {{id}}
Description:

```
{{description}}
```

{{#if websites}}
Websites:
{{#each websites}}- {{{this}}}
{{/each}}
{{/if}}
{{#if repositories}}
Repositories:
{{#each repositories}}- {{{this}}}
{{/each}}
{{/if}}
{{#if businessUseCases}}
Business use cases:
{{#each businessUseCases}}- {{{this}}}
{{/each}}
{{/if}}
{{#if functionalUseCases}}
Functional use cases:
{{#each functionalUseCases}}- {{{this}}}
{{/each}}
{{/if}}
{{#if tools}}
Tools used:
{{#each tools}}- {{{this}}}
{{/each}}
{{/if}}
