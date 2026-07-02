package g711

import "testing"

func TestALawKnownSilenceCodes(t *testing.T) {
	if got := DecodeALaw(0xd5); got != 8 {
		t.Fatalf("DecodeALaw(0xd5) = %d", got)
	}
	if got := DecodeALaw(0x55); got != -8 {
		t.Fatalf("DecodeALaw(0x55) = %d", got)
	}
}

func TestALawFrameRoundTripKeepsShape(t *testing.T) {
	input := []int16{-2048, -512, -8, 8, 512, 2048}
	encoded := EncodeALawFrame(input)
	decoded := DecodeALawFrame(encoded)
	if len(decoded) != len(input) {
		t.Fatalf("decoded length = %d", len(decoded))
	}
	for i := range input {
		if !sameSign(input[i], decoded[i]) {
			t.Fatalf("sample %d changed sign: in=%d out=%d", i, input[i], decoded[i])
		}
	}
}

func TestALawEncodeDoesNotSaturateEarly(t *testing.T) {
	mid := EncodeALaw(5000)
	loud := EncodeALaw(30000)
	if mid == loud {
		t.Fatal("mid and loud samples encoded to the same A-law value")
	}
}

func sameSign(a, b int16) bool {
	return (a >= 0 && b >= 0) || (a < 0 && b < 0)
}
