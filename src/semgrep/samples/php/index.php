<?php

class Mailer {
  public function __construct() {}

  public function sendWelcomeMessage() {
    $this->sendEmail();
  }

  protected function sendEmail() {}
}

$globalCallback = function () {};

$onSentShouldBeIgnored = function () {};

function run() {
  $contextualVariable = 'it has been a success';
  $notificationCallback = function () use ($contextualVariable) {
    echo $contextualVariable . PHP_EOL;
  };

  $mailer = new Mailer();
  $mailer->sendWelcomeMessage();

  $notificationCallback();
}

run();
$globalCallback();

?>
