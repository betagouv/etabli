class Mailer {
  constructor() {}

  public sendWelcomeMessage() {
    this.sendEmail();
  }

  protected sendEmail() {}
}

function run() {
  const contextualVariable = 'it has been a success';
  const notificationCallback = () => {
    console.log(contextualVariable);
  };

  const mailer = new Mailer();
  mailer.sendWelcomeMessage();

  notificationCallback();
}

run();
