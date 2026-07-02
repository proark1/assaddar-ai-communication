package audio

type VAD struct {
	SampleRate       int
	EnergyThreshold  int64
	MinSpeechSamples int
	SilenceSamples   int
	MaxSamples       int

	buffer        []int16
	inSpeech      bool
	speechSamples int
	silentSamples int
}

func NewTelephonyVAD() *VAD {
	return &VAD{
		SampleRate:       8000,
		EnergyThreshold:  700,
		MinSpeechSamples: 8000 / 5,
		SilenceSamples:   8000 * 4 / 10,
		MaxSamples:       8000 * 6,
	}
}

func (vad *VAD) Feed(samples []int16) ([]int16, bool) {
	if len(samples) == 0 {
		return nil, false
	}
	energy := meanAbs(samples)
	if energy >= vad.EnergyThreshold {
		vad.inSpeech = true
		vad.speechSamples += len(samples)
		vad.silentSamples = 0
	}
	if vad.inSpeech {
		vad.buffer = append(vad.buffer, samples...)
		if energy < vad.EnergyThreshold {
			vad.silentSamples += len(samples)
		}
	}
	if !vad.inSpeech {
		return nil, false
	}
	if vad.speechSamples >= vad.MinSpeechSamples &&
		(vad.silentSamples >= vad.SilenceSamples || len(vad.buffer) >= vad.MaxSamples) {
		utterance := append([]int16(nil), vad.buffer...)
		vad.Reset()
		return utterance, true
	}
	return nil, false
}

func (vad *VAD) Reset() {
	vad.buffer = nil
	vad.inSpeech = false
	vad.speechSamples = 0
	vad.silentSamples = 0
}

func meanAbs(samples []int16) int64 {
	var sum int64
	for _, sample := range samples {
		value := int64(sample)
		if value < 0 {
			value = -value
		}
		sum += value
	}
	return sum / int64(len(samples))
}
