I describe below a project composed of {{websites.length}} websites and {{repositories.length}} repositories, and I want you to output some information:

1. business use cases of what the project does (not functional things like sending emails), try to reuse those from the provided list `definedBusinessUseCases` when valid, otherwise if it's a new one use simple words to keep it clear (10 words maximum)
2. a description of 100 words maximum of what the project does (business words, not about technical stuff)
3. all tools that are frameworks or services through an API. First, you find them and find their main commercial name while skipping those that seem tiny libraries, protocol standards, or font libraries. Once you have the list to output, if some items have their correspondance in the context list, use correspondance name instead
4. to know if yes/no the project checkes those cases:
   - has virtual email inboxes
   - sends emails
   - ability to build a PDF document

You must answer in JSON format by respecting the following typescript format and while writting values in french:

```ts
{{! this Handlebars comment is needed so Prettier will not format weirdily the injection of the definition }}
{{{resultSchemaDefinition}}}
```

**Do not include any explanation. Below all the information to analyze:**

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
