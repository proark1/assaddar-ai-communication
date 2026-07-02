package audio

import "testing"

func TestResampleLinearChangesLength(t *testing.T) {
	out := ResampleLinear([]int16{0, 1000, 0, -1000}, 8000, 16000)
	if len(out) != 8 {
		t.Fatalf("len(out) = %d", len(out))
	}
}

func TestConditionForTelephonyDownsamples(t *testing.T) {
	input := make([]int16, 240)
	for i := range input {
		if i%2 == 0 {
			input[i] = 30000
		} else {
			input[i] = -30000
		}
	}
	out := ConditionForTelephony(input, 24000, 8000)
	if len(out) != 80 {
		t.Fatalf("len(out) = %d", len(out))
	}
}

func TestConditionForTelephonyBoostsQuietAudio(t *testing.T) {
	out := ConditionForTelephony(repeatedSample(1000, 80), 8000, 8000)
	if len(out) != 80 {
		t.Fatalf("len(out) = %d", len(out))
	}
	if out[0] <= 1000 {
		t.Fatalf("out[0] = %d, want boosted sample", out[0])
	}
}

func TestWAVRoundTrip(t *testing.T) {
	input := []int16{-1000, 0, 1000}
	wav := EncodeWAVPCM16(input, 16000)
	output, rate, err := DecodeWAVPCM16(wav)
	if err != nil {
		t.Fatalf("DecodeWAVPCM16 returned error: %v", err)
	}
	if rate != 16000 {
		t.Fatalf("rate = %d", rate)
	}
	if len(output) != len(input) {
		t.Fatalf("len(output) = %d", len(output))
	}
	for i := range input {
		if output[i] != input[i] {
			t.Fatalf("sample %d = %d", i, output[i])
		}
	}
}

func TestVADReturnsUtteranceAfterSilence(t *testing.T) {
	vad := NewTelephonyVAD()
	var ok bool
	for i := 0; i < 12; i++ {
		_, ok = vad.Feed(repeatedSample(1200, 160))
		if ok {
			t.Fatal("utterance ended while speech continued")
		}
	}
	var utterance []int16
	for i := 0; i < 40; i++ {
		utterance, ok = vad.Feed(repeatedSample(0, 160))
		if ok {
			break
		}
	}
	if !ok {
		t.Fatal("expected utterance after silence")
	}
	if len(utterance) == 0 {
		t.Fatal("empty utterance")
	}
}

func repeatedSample(value int16, count int) []int16 {
	out := make([]int16, count)
	for i := range out {
		out[i] = value
	}
	return out
}
