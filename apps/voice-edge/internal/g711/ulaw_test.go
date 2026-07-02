package g711

import "testing"

func TestULawKnownSilence(t *testing.T) {
	if got := DecodeULaw(0xff); got != 0 {
		t.Fatalf("DecodeULaw(0xff) = %d", got)
	}
}

func TestULawFrameRoundTripKeepsShape(t *testing.T) {
	input := []int16{-2048, -512, 0, 512, 2048}
	encoded := EncodeULawFrame(input)
	decoded := DecodeULawFrame(encoded)
	if len(decoded) != len(input) {
		t.Fatalf("decoded length = %d", len(decoded))
	}
	for i := range input {
		if !sameSign(input[i], decoded[i]) {
			t.Fatalf("sample %d changed sign: in=%d out=%d", i, input[i], decoded[i])
		}
	}
}
