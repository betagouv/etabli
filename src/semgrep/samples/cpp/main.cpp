#include <iostream>
#include <functional>
#include <future>

class Mailer
{
public:
  Mailer() {}

  void sendWelcomeMessage()
  {
    sendEmail();
  }

protected:
  virtual void sendEmail() {}
};

void globalCallback() {}

std::future<void> asyncGlobalCallback()
{
  return std::async(std::launch::async, [] {});
}

void onSentShouldBeIgnored() {}

void run()
{
  std::string contextualVariable = "it has been a success";
  auto notificationCallback = [&contextualVariable]()
  {
    std::cout << contextualVariable << std::endl;
  };

  Mailer mailer;
  mailer.sendWelcomeMessage();

  notificationCallback();
  globalCallback();
}

int main()
{
  run();
  return 0;
}
