public class Main {
  private static final Runnable globalCallback = () -> {};

  public static void main(String[] args) {
    final Runnable onSentShouldBeIgnored = () -> {};

    run();
  }

  public static void run() {
    final String contextualVariable = "it has been a success";
    final Runnable notificationCallback = () -> {
      System.out.println(contextualVariable);
    };

    Mailer mailer = new Mailer();
    mailer.sendWelcomeMessage();

    notificationCallback.run();
    globalCallback.run();
  }
}

public class Mailer {
  public Mailer() {}

  public void sendWelcomeMessage() {
    sendEmail();
  }

  // Test with boolean due to research pattern with "void"
  protected boolean sendEmail() {}
}
