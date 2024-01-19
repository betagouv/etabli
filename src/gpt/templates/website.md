{{#if website.deducedTools}}
Here is the list of tools deduced with Wappalyzer from the frontend of the public website number {{websiteNumber}}:

```
{{#each website.deducedTools}}
{{{this}}}
{{/each}}
```

{{/if}}

{{#if website.content}}
Here is the resume from the public website number {{websiteNumber}}:

```
{{{website.content}}}
```

{{/if}}
