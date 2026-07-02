package audio

func ResampleLinear(samples []int16, fromRate int, toRate int) []int16 {
	if len(samples) == 0 || fromRate <= 0 || toRate <= 0 {
		return nil
	}
	if fromRate == toRate {
		out := make([]int16, len(samples))
		copy(out, samples)
		return out
	}
	outLen := int((int64(len(samples)) * int64(toRate)) / int64(fromRate))
	if outLen < 1 {
		outLen = 1
	}
	out := make([]int16, outLen)
	ratio := float64(fromRate) / float64(toRate)
	for i := range out {
		position := float64(i) * ratio
		left := int(position)
		if left >= len(samples)-1 {
			out[i] = samples[len(samples)-1]
			continue
		}
		frac := position - float64(left)
		a := float64(samples[left])
		b := float64(samples[left+1])
		out[i] = int16(a + (b-a)*frac)
	}
	return out
}
