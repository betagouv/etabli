struct Mailer;

impl Mailer {
  fn new() -> Self {
    Mailer
  }

  pub fn send_welcome_message(&self) {
    self.send_email();
  }

  fn send_email(&self) {}
}

fn global_callback() {}

async fn async_global_callback() {}

fn on_sent_should_be_ignored() {}

fn run() {
  let contextual_variable = "it has been a success";
  let notification_callback = || {
    println!("{}", contextual_variable);
  };

  let mailer = Mailer::new();
  mailer.send_welcome_message();

  notification_callback();
  global_callback();
}

fn main() {
  run();
}
