export interface Result {
  businessUseCases: string[];
  description: string;
  functionalUseCases: {
    hasVirtualEmailInboxes: boolean;
    sendsEmails: boolean;
    generatesPDF: boolean;
  };
}

export const resultSample: Result = {
  businessUseCases: [],
  description: '',
  functionalUseCases: {
    hasVirtualEmailInboxes: false,
    sendsEmails: false,
    generatesPDF: false,
  },
};
