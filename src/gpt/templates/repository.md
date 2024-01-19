{{#if repository.functions}}
Here is the list of functions in the source code of the repository number {{repositoryNumber}}:

```
{{#each repository.functions}}
{{{this}}}
{{/each}}
```

{{/if}}

{{#if repository.dependencies}}
Here is the list of dependencies listed in the source code of the repository number {{repositoryNumber}}:

```
{{#each repository.dependencies}}
{{{this}}}
{{/each}}
```

{{/if}}

{{#if repository.readme}}
Here is the content of the `README.md` of the repository number {{repositoryNumber}}:

```
{{{repository.readme}}}
```

{{/if}}
