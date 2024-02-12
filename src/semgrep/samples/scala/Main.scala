import scala.concurrent.{Future}
import scala.concurrent.ExecutionContext.Implicits.global

class Mailer {
  def sendWelcomeMessage(): Unit = {
    sendEmail()
  }

  protected def sendEmail(): Unit = {}
}

val globalCallback: () => Unit = () => {}
val asyncGlobalCallback: Future[String] = Future {
  "hello"
}

val onSentShouldBeIgnored: () => Unit = () => {}

def run(): Unit = {
  val contextualVariable = "it has been a success"
  val notificationCallback: () => Unit = () => {
    println(contextualVariable)
  }

  val mailer = new Mailer()
  mailer.sendWelcomeMessage()

  notificationCallback()
  globalCallback()
}

run()
