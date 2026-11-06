// Local synthetic component driver, not the Gas City supervisor HTTP API.
// Links unchanged gastownhall/gascity @ 3f3224faaeff2da774417293e4a847aa421365a5 (MIT).
// Only a fixed finite sleep worker can be started. No arbitrary commands or PIDs.
package main

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gastownhall/gascity/internal/runtime"
	"github.com/gastownhall/gascity/internal/runtime/proctable"
	"github.com/gastownhall/gascity/internal/runtime/subprocess"
)

const session = "acme-run"
const revision = "3f3224faaeff2da774417293e4a847aa421365a5"

type driver struct {
	mu       sync.Mutex
	provider *subprocess.Provider
	dir      string
	pid      int
	identity string
	fence    string
	creates  int
}
type request struct {
	Action string `json:"action"`
	Fence  string `json:"fence"`
}
type observation struct {
	Session          string `json:"session"`
	PID              int    `json:"pid"`
	StartIdentity    string `json:"startIdentity"`
	Fence            string `json:"fence"`
	InputFenceDigest string `json:"inputFenceDigest"`
	Creates          int    `json:"creates"`
	Running          bool   `json:"running"`
	ExitConfirmed    bool   `json:"exitConfirmed"`
}

func (d *driver) observe() (observation, error) {
	obs, err := d.provider.ObserveLivenessWithError(session, nil)
	result := observation{Session: session, PID: d.pid, StartIdentity: d.identity, Fence: d.fence, Creates: d.creates, Running: obs.Running}
	if d.fence != "" {
		result.InputFenceDigest = (runtime.InputFence{Generation: 1, Epoch: 1, Token: d.fence}).Digest()
	}
	if err != nil {
		return result, err
	}
	if d.pid > 1 && d.identity != "" {
		current, err := proctable.ProcessIdentity(d.pid)
		switch {
		case errors.Is(err, proctable.ErrProcessGone):
			result.ExitConfirmed = !obs.Running
		case err != nil:
			return result, err
		case current != d.identity:
			result.ExitConfirmed = !obs.Running // original incarnation is gone; never signal its replacement
		}
	}
	return result, nil
}
func (d *driver) handle(w http.ResponseWriter, r *http.Request) {
	d.mu.Lock()
	defer d.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	var in request
	if r.Method != "POST" || r.URL.Path != "/component" || json.NewDecoder(http.MaxBytesReader(w, r.Body, 2048)).Decode(&in) != nil {
		http.Error(w, "invalid fixture request", 400)
		return
	}
	var err error
	switch in.Action {
	case "create":
		if in.Fence == "" || len(in.Fence) > 100 {
			err = errors.New("missing fixture fence")
			break
		}
		err = d.provider.Start(context.Background(), session, runtime.Config{Command: "exec /bin/sleep 60", Env: map[string]string{runtime.RuntimeEpochEnv: "1", runtime.ContinuationEpochEnv: "1", runtime.InstanceTokenEnv: in.Fence}})
		if err != nil {
			break
		}
		d.creates++
		d.fence = in.Fence
		// The provider's own per-session control socket reports its child PID.
		var conn net.Conn
		key := sha256.Sum256([]byte(session))
		conn, err = net.DialTimeout("unix", filepath.Join(d.dir, "s"+hex.EncodeToString(key[:4])+".sock"), time.Second)
		if err != nil {
			break
		}
		_ = conn.SetDeadline(time.Now().Add(time.Second))
		_, err = fmt.Fprintln(conn, "pid")
		var line string
		if err == nil {
			line, err = bufio.NewReader(conn).ReadString('\n')
		}
		_ = conn.Close()
		if err == nil {
			d.pid, err = strconv.Atoi(strings.TrimSpace(line))
		}
		if err == nil {
			d.identity, err = proctable.ProcessIdentity(d.pid)
		}
	case "stale-interrupt":
		err = d.provider.InterruptFenced(context.Background(), session, runtime.InputFence{Generation: 1, Epoch: 1, Token: "acme-stale"})
	case "stop":
		err = d.provider.Stop(session)
	case "inspect":
	default:
		err = errors.New("unsupported fixture action")
	}
	if err != nil {
		var miss *runtime.FenceMismatchError
		if errors.As(err, &miss) {
			w.WriteHeader(409)
			_ = json.NewEncoder(w).Encode(map[string]any{"code": "fence-mismatch", "found": miss.Found, "partial": miss.Partial})
			return
		}
		w.WriteHeader(409)
		_ = json.NewEncoder(w).Encode(map[string]string{"code": "component-error", "error": err.Error()})
		return
	}
	obs, err := d.observe()
	if err != nil {
		w.WriteHeader(503)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	_ = json.NewEncoder(w).Encode(obs)
}
func main() {
	if len(os.Args) != 2 {
		panic("expected owned socket directory")
	}
	dir := os.Args[1]
	if err := os.Mkdir(dir, 0700); err != nil {
		panic(err)
	}
	d := &driver{provider: subprocess.NewProviderWithDir(dir), dir: dir}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		panic(err)
	}
	server := &http.Server{Handler: http.HandlerFunc(d.handle), ReadHeaderTimeout: time.Second}
	go func() { _ = server.Serve(listener) }()
	_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"base": "http://" + listener.Addr().String(), "revision": revision, "driverPID": os.Getpid()})
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGTERM, syscall.SIGINT)
	select {
	case <-signals:
	case <-time.After(90 * time.Second):
	}
	_ = server.Close()
	d.mu.Lock()
	defer d.mu.Unlock()
	stopErr := d.provider.Stop(session)
	obs, observeErr := d.observe()
	_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"cleanup": true, "observation": obs, "stopError": fmt.Sprint(stopErr), "observeError": fmt.Sprint(observeErr)})
	if stopErr != nil || observeErr != nil || (d.creates > 0 && !obs.ExitConfirmed) {
		os.Exit(1)
	}
}
