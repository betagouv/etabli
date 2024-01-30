package main

import (
	"fmt"
)

type Mailer struct{}

func (m *Mailer) sendWelcomeMessage() {
	m.sendEmail()
}

func (m *Mailer) sendEmail() {}

func globalCallback() {}

func onSentShouldBeIgnored() {}

func run() {
	contextualVariable := "it has been a success"
	notificationCallback := func() {
		fmt.Println(contextualVariable)
	}

	mailer := &Mailer{}
	mailer.sendWelcomeMessage()

	notificationCallback()
	globalCallback()
}

func main() {
	run()
}
