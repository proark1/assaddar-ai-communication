package media

import (
	"errors"
	"sync"
)

type PortPool struct {
	mu     sync.Mutex
	min    int
	max    int
	next   int
	leased map[int]struct{}
}

func NewPortPool(minPort int, maxPort int) (*PortPool, error) {
	if minPort < 1 || maxPort < minPort {
		return nil, errors.New("invalid port range")
	}
	return &PortPool{
		min:    minPort,
		max:    maxPort,
		next:   minPort,
		leased: map[int]struct{}{},
	}, nil
}

func (pool *PortPool) Lease() (int, error) {
	pool.mu.Lock()
	defer pool.mu.Unlock()

	capacity := pool.max - pool.min + 1
	for i := 0; i < capacity; i++ {
		port := pool.next
		pool.next++
		if pool.next > pool.max {
			pool.next = pool.min
		}
		if _, ok := pool.leased[port]; ok {
			continue
		}
		pool.leased[port] = struct{}{}
		return port, nil
	}
	return 0, errors.New("no rtp ports available")
}

func (pool *PortPool) Release(port int) {
	pool.mu.Lock()
	defer pool.mu.Unlock()
	delete(pool.leased, port)
}
