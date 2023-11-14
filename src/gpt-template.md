I describe below a project and I want you output some information:

1. business use cases of what the project does (not functional things like sending emails), use simple words to keep it clear (10 items maximum)
2. a description of 100 words maximum of what the project does (business words, not about technical stuff)
3. to know if yes/no the project checkes those cases:
   - has virtual email inboxes
   - sends emails
   - generates PDF

You must answer by respecting the following JSON format (adjust values only, and write them in french):

```json
{{{resultSample}}}
```

Here is the list of functions in the source code:

```
{{#each functions}}
{{{this}}}
{{/each}}
```

Here is the list of dependencies listed in the source code:

```
{{#each dependencies}}
{{{this}}}
{{/each}}

```

And here is the resume from the public website:

```
{{{websiteContent}}}
```
