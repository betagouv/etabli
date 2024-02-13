/**
 * @jest-environment node
 */
import { extractFirstJsonCodeContentFromMarkdown } from '@etabli/src/features/llm';

describe('extractFirstJsonCodeContentFromMarkdown()', () => {
  const markdown = `Hello, I just generated this:

\`\`\`json
{
  "businessUseCases": ["détection de l’illettrisme", "valorisation des compétences transversales"],
  "description": "Eva est une solution numérique qui permet la détection de l’illettrisme et la valorisation des compétences transversales. Elle s’adresse à tous les professionnels de l’insertion qui souhaitent évaluer ces compétences de manière ludique.",
  "tools": ["WordPress", "PHP", "MySQL", "Elementor", "Yoast SEO", "Apache HTTP Server", "MailChimp", "MailChimp for WordPress", "Matomo Analytics", "jQuery UI", "jQuery Migrate", "jQuery", "core-js", "Priority Hints", "Google Font API", "Mailjet", "RSS", "PWA", "Open Graph"],
  "functionalUseCases": {
    "hasVirtualEmailInboxes": false,
    "sendsEmails": true,
    "generatesPDF": false
  }
}
\`\`\`

What do you think of?
`;

  it('should return the json string only', async () => {
    expect(extractFirstJsonCodeContentFromMarkdown(markdown)).toBe(
      `
{
  "businessUseCases": ["détection de l’illettrisme", "valorisation des compétences transversales"],
  "description": "Eva est une solution numérique qui permet la détection de l’illettrisme et la valorisation des compétences transversales. Elle s’adresse à tous les professionnels de l’insertion qui souhaitent évaluer ces compétences de manière ludique.",
  "tools": ["WordPress", "PHP", "MySQL", "Elementor", "Yoast SEO", "Apache HTTP Server", "MailChimp", "MailChimp for WordPress", "Matomo Analytics", "jQuery UI", "jQuery Migrate", "jQuery", "core-js", "Priority Hints", "Google Font API", "Mailjet", "RSS", "PWA", "Open Graph"],
  "functionalUseCases": {
    "hasVirtualEmailInboxes": false,
    "sendsEmails": true,
    "generatesPDF": false
  }
}
    `.trim()
    );
  });
});
