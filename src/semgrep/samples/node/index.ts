class Mailer {
  constructor() {}

  public sendWelcomeMessage() {
    this.sendEmail();
  }

  protected sendEmail() {}
}

const globalCallback = () => {};
const asyncGlobalCallback = async () => {};

const onSentShouldBeIgnored = () => {};
const MessageFormComponentShouldBeIgnored = () => {};

function run() {
  const contextualVariable = 'it has been a success';
  const notificationCallback = () => {
    console.log(contextualVariable);
  };

  const mailer = new Mailer();
  mailer.sendWelcomeMessage();

  notificationCallback();
  globalCallback();
}

run();
