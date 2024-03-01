{{#if website.deducedTools}}
La liste des outils déduits avec Wappalyzer depuis le site internet du site public numéro {{websiteNumber}} :

```
{{#each website.deducedTools}}
{{{this}}}
{{/each}}
```

{{/if}}

{{#if website.content}}
Le résumé du site public numéro {{websiteNumber}} :

```
{{{website.content}}}
```

{{/if}}
