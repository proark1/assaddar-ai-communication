package sdp

import (
	"strings"
	"testing"
)

func TestParseOfferAndChoosePCMA(t *testing.T) {
	offer, err := ParseOffer("v=0\r\nc=IN IP4 198.51.100.2\r\nm=audio 40000 RTP/AVP 8 0\r\na=rtpmap:8 PCMA/8000\r\n")
	if err != nil {
		t.Fatalf("ParseOffer returned error: %v", err)
	}
	if offer.ConnectionIP != "198.51.100.2" || offer.MediaPort != 40000 {
		t.Fatalf("offer = %+v", offer)
	}
	codec, ok := offer.PreferredCodec()
	if !ok {
		t.Fatal("expected preferred codec")
	}
	if codec != CodecPCMA {
		t.Fatalf("codec = %+v", codec)
	}
}

func TestAnswerIncludesSelectedCodec(t *testing.T) {
	answer := Answer("203.0.113.10", 30000, CodecPCMA)
	if !strings.Contains(answer, "m=audio 30000 RTP/AVP 8") {
		t.Fatalf("answer missing media line:\n%s", answer)
	}
	if !strings.Contains(answer, "a=rtpmap:8 PCMA/8000") {
		t.Fatalf("answer missing rtpmap:\n%s", answer)
	}
}
