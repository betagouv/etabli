class Mailer
  def initialize
  end

  def send_welcome_message
    send_email
  end

  protected

  def send_email
  end
end

$global_callback = -> {}

on_sent_should_be_ignored = -> {}

def run
  contextual_variable = 'it has been a success'
  notification_callback = proc { puts contextual_variable }

  mailer = Mailer.new
  mailer.send_welcome_message

  notification_callback.call
  $global_callback.call
end

run
