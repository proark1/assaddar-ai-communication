package audio

import "math"

const (
	telephonyTargetPeak     = 18000.0
	telephonyMaxGain        = 3.0
	telephonyLimiterCeiling = 30000.0
)

func ConditionForTelephony(samples []int16, fromRate int, toRate int) []int16 {
	if len(samples) == 0 || fromRate <= 0 || toRate <= 0 {
		return nil
	}
	working := make([]int16, len(samples))
	copy(working, samples)
	if fromRate > toRate {
		working = LowPass(working, fromRate, float64(toRate)*0.42)
	}
	if fromRate != toRate {
		working = ResampleLinear(working, fromRate, toRate)
	}
	return NormalizeAndLimit(working)
}

func LowPass(samples []int16, sampleRate int, cutoffHz float64) []int16 {
	if len(samples) == 0 {
		return nil
	}
	if sampleRate <= 0 || cutoffHz <= 0 || cutoffHz >= float64(sampleRate)/2 {
		out := make([]int16, len(samples))
		copy(out, samples)
		return out
	}
	rc := 1.0 / (2 * math.Pi * cutoffHz)
	dt := 1.0 / float64(sampleRate)
	alpha := dt / (rc + dt)

	filtered := make([]float64, len(samples))
	y := float64(samples[0])
	filtered[0] = y
	for i := 1; i < len(samples); i++ {
		y += alpha * (float64(samples[i]) - y)
		filtered[i] = y
	}

	y = filtered[len(filtered)-1]
	for i := len(filtered) - 2; i >= 0; i-- {
		y += alpha * (filtered[i] - y)
		filtered[i] = y
	}

	out := make([]int16, len(samples))
	for i, sample := range filtered {
		out[i] = clampPCM(sample)
	}
	return out
}

func NormalizeAndLimit(samples []int16) []int16 {
	if len(samples) == 0 {
		return nil
	}
	peak := 0.0
	for _, sample := range samples {
		value := math.Abs(float64(sample))
		if value > peak {
			peak = value
		}
	}
	out := make([]int16, len(samples))
	if peak == 0 {
		return out
	}
	gain := telephonyTargetPeak / peak
	if gain > telephonyMaxGain {
		gain = telephonyMaxGain
	}
	for i, sample := range samples {
		out[i] = softLimitPCM(float64(sample) * gain)
	}
	return out
}

func softLimitPCM(value float64) int16 {
	if value > telephonyLimiterCeiling {
		value = telephonyLimiterCeiling + (32767.0-telephonyLimiterCeiling)*math.Tanh((value-telephonyLimiterCeiling)/(32767.0-telephonyLimiterCeiling))
	}
	if value < -telephonyLimiterCeiling {
		value = -telephonyLimiterCeiling - (32768.0-telephonyLimiterCeiling)*math.Tanh((-value-telephonyLimiterCeiling)/(32768.0-telephonyLimiterCeiling))
	}
	return clampPCM(value)
}

func clampPCM(value float64) int16 {
	if value > 32767 {
		return 32767
	}
	if value < -32768 {
		return -32768
	}
	return int16(math.Round(value))
}
