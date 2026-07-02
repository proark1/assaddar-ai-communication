package rtp

import "testing"

func TestPacketMarshalParse(t *testing.T) {
	packet := Packet{
		Marker:         true,
		PayloadType:    8,
		SequenceNumber: 42,
		Timestamp:      160,
		SSRC:           99,
		Payload:        []byte{0xd5, 0xd5, 0xd5},
	}
	raw, err := packet.Marshal()
	if err != nil {
		t.Fatalf("Marshal returned error: %v", err)
	}
	parsed, err := ParsePacket(raw)
	if err != nil {
		t.Fatalf("ParsePacket returned error: %v", err)
	}
	if parsed.PayloadType != packet.PayloadType ||
		parsed.SequenceNumber != packet.SequenceNumber ||
		parsed.Timestamp != packet.Timestamp ||
		parsed.SSRC != packet.SSRC ||
		!parsed.Marker {
		t.Fatalf("parsed packet mismatch: %+v", parsed)
	}
	if string(parsed.Payload) != string(packet.Payload) {
		t.Fatalf("payload = %v", parsed.Payload)
	}
}
