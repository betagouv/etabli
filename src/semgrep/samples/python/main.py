class Mailer:
  def __init__(self):
    pass

  def send_welcome_message(self):
    self.send_email()

  def send_email(self):
    pass

def global_callback():
  pass

async def async_global_callback():
  pass

def on_sent_should_be_ignored():
  pass

def run():
  contextual_variable = 'it has been a success'

  def notification_callback():
    print(contextual_variable)

  mailer = Mailer()
  mailer.send_welcome_message()

  notification_callback()
  global_callback()

run()
