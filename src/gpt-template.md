I describe below a project and I want you to output some information:

1. business use cases of what the project does (not functional things like sending emails), use simple words to keep it clear (10 items maximum)
2. a description of 100 words maximum of what the project does (business words, not about technical stuff)
3. all tools that are frameworks or services through an API (use your knowledge to match their main commercial name, and skip those that seem tiny libraries, protocol standards, or font libraries)
4. to know if yes/no the project checkes those cases:
   - has virtual email inboxes
   - sends emails
   - ability to build a PDF document

You must answer by respecting the following JSON format (adjust values only, and write them in french):

```json
{{{resultSample}}}
```

{{#if functions}}
Here is the list of functions in the source code:

```
{{#each functions}}
{{{this}}}
{{/each}}
```

{{/if}}

{{#if deducedTools}}
Here is the list of tools deduced with Wappalyzer from the frontend:

```
{{#each deducedTools}}
{{{this}}}
{{/each}}
```

{{/if}}

{{#if dependencies}}
Here is the list of dependencies listed in the source code:

```
{{#each dependencies}}
{{{this}}}
{{/each}}
```

{{/if}}

{{#if websiteContent}}
Here is the resume from the public website:

```
{{{websiteContent}}}
```

{{/if}}
