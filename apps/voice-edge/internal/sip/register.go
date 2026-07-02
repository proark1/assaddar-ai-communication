package sip

import (
	"fmt"
)

type RegisterOptions struct {
	Registrar   string
	Username    string
	FromDomain  string
	ContactHost string
	ContactPort int
	CallID      string
	CSeq        int
	Branch      string
	Expires     int
}

func BuildRegisterRequest(options RegisterOptions, authorization string) Message {
	registrarURI := "sip:" + options.Registrar
	fromURI := fmt.Sprintf("sip:%s@%s", options.Username, options.FromDomain)
	contactURI := fmt.Sprintf("<sip:%s@%s:%d>", options.Username, options.ContactHost, options.ContactPort)
	msg := NewRequest("REGISTER", registrarURI)
	msg.AddHeader("Via", fmt.Sprintf("SIP/2.0/UDP %s:%d;branch=%s;rport", options.ContactHost, options.ContactPort, options.Branch))
	msg.AddHeader("Max-Forwards", "70")
	msg.AddHeader("From", fmt.Sprintf("<%s>;tag=%s", fromURI, options.Branch))
	msg.AddHeader("To", fmt.Sprintf("<%s>", fromURI))
	msg.AddHeader("Call-ID", options.CallID)
	msg.AddHeader("CSeq", fmt.Sprintf("%d REGISTER", options.CSeq))
	msg.AddHeader("Contact", contactURI)
	msg.AddHeader("Expires", fmt.Sprintf("%d", options.Expires))
	msg.AddHeader("User-Agent", "AssaddarVoiceEdge/0.1")
	if authorization != "" {
		msg.AddHeader("Authorization", authorization)
	}
	return msg
}
