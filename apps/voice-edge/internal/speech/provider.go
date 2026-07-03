package speech

import "context"

type Provider interface {
	Transcribe(ctx context.Context, audio PCMBuffer) (Transcript, error)
	Synthesize(ctx context.Context, text string, options SynthesisOptions) (PCMBuffer, error)
}

type PCMChunkHandler func(PCMBuffer) error

type StreamingProvider interface {
	SynthesizeStream(ctx context.Context, text string, options SynthesisOptions, onChunk PCMChunkHandler) error
}

type PCMBuffer struct {
	SampleRate int
	Samples    []int16
}

type Transcript struct {
	Text       string
	Confidence float64
}

type SynthesisOptions struct {
	Locale string
	Voice  string
}
