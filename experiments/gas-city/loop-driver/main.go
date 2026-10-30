// Synthetic worker driver; links unchanged Gas City 3f3224faaeff2da774417293e4a847aa421365a5 (MIT).
// This is a component protocol, not the city supervisor API.
package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/gastownhall/gascity/internal/runtime"
	"github.com/gastownhall/gascity/internal/runtime/proctable"
	"github.com/gastownhall/gascity/internal/runtime/subprocess"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const revision = "3f3224faaeff2da774417293e4a847aa421365a5"

type observation struct {
	ID       string `json:"id"`
	PID      int    `json:"pid"`
	Identity string `json:"identity"`
	Fence    string `json:"fence"`
	Running  bool   `json:"running"`
	Exited   bool   `json:"exited"`
}
type driver struct {
	mu                        sync.Mutex
	p                         *subprocess.Provider
	root, node, worker, token string
	runs                      map[string]observation
	creates                   int
}

func quote(s string) string { return "'" + strings.ReplaceAll(s, "'", "'\"'\"'") + "'" }
func (d *driver) observe(id string) (observation, error) {
	o, ok := d.runs[id]
	if !ok {
		return o, errors.New("unknown session")
	}
	live, e := d.p.ObserveLivenessWithError(id, nil)
	if e != nil {
		return o, e
	}
	o.Running = live.Running
	identity, e := proctable.ProcessIdentity(o.PID)
	if errors.Is(e, proctable.ErrProcessGone) || e == nil && identity != o.Identity {
		o.Exited = !o.Running
	} else if e != nil {
		return o, e
	}
	return o, nil
}
func (d *driver) handle(w http.ResponseWriter, r *http.Request) {
	d.mu.Lock()
	defer d.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	if r.Header.Get("Authorization") != "Bearer "+d.token {
		http.Error(w, "refused", 401)
		return
	}
	var in struct{ Action, ID, Fence string }
	if r.Method != "POST" || r.URL.Path != "/component" || json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&in) != nil || !regexp.MustCompile(`^acme-[a-z0-9-]{1,60}$`).MatchString(in.ID) {
		http.Error(w, "invalid", 400)
		return
	}
	var e error
	switch in.Action {
	case "start":
		if _, ok := d.runs[in.ID]; ok {
			http.Error(w, "duplicate start refused", 409)
			return
		}
		if len(d.runs) >= 12 || len(in.Fence) < 10 || len(in.Fence) > 100 {
			http.Error(w, "bounded trial only", 400)
			return
		}
		if _, e = os.Stat(filepath.Join(d.root, "tasks", in.ID+".json")); e != nil {
			break
		}
		e = d.p.Start(context.Background(), in.ID, runtime.Config{Command: "exec " + quote(d.node) + " " + quote(d.worker) + " " + quote(d.root) + " " + quote(in.ID), Env: map[string]string{runtime.RuntimeEpochEnv: "1", runtime.ContinuationEpochEnv: "1", runtime.InstanceTokenEnv: in.Fence}})
		if e != nil {
			break
		}
		d.creates++
		// Retain a cleanup handle even when PID proof collection fails.
		d.runs[in.ID] = observation{ID: in.ID, Fence: in.Fence}
		key := sha256.Sum256([]byte(in.ID))
		var c net.Conn
		c, e = net.DialTimeout("unix", filepath.Join(d.root, "sockets", "s"+hex.EncodeToString(key[:4])+".sock"), time.Second)
		if e != nil {
			break
		}
		_ = c.SetDeadline(time.Now().Add(time.Second))
		_, e = fmt.Fprintln(c, "pid")
		var line string
		if e == nil {
			line, e = bufio.NewReader(c).ReadString('\n')
		}
		_ = c.Close()
		var pid int
		if e == nil {
			pid, e = strconv.Atoi(strings.TrimSpace(line))
		}
		var identity string
		if e == nil {
			identity, e = proctable.ProcessIdentity(pid)
		}
		if e == nil {
			d.runs[in.ID] = observation{ID: in.ID, PID: pid, Identity: identity, Fence: in.Fence}
		}
	case "stop":
		e = d.p.Stop(in.ID)
	case "inspect":
	default:
		e = errors.New("unsupported action")
	}
	if e != nil {
		http.Error(w, e.Error(), 409)
		return
	}
	o, e := d.observe(in.ID)
	if e != nil {
		http.Error(w, e.Error(), 503)
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"observation": o, "creates": d.creates})
}
func main() {
	if len(os.Args) != 4 {
		panic("owned root, Node and fixed worker required")
	}
	root := os.Args[1]
	if e := os.Mkdir(filepath.Join(root, "sockets"), 0700); e != nil {
		panic(e)
	}
	secret := make([]byte, 32)
	if _, e := rand.Read(secret); e != nil {
		panic(e)
	}
	d := &driver{p: subprocess.NewProviderWithDir(filepath.Join(root, "sockets")), root: root, node: os.Args[2], worker: os.Args[3], token: hex.EncodeToString(secret), runs: map[string]observation{}}
	l, e := net.Listen("tcp", "127.0.0.1:0")
	if e != nil {
		panic(e)
	}
	s := &http.Server{Handler: http.HandlerFunc(d.handle), ReadHeaderTimeout: time.Second}
	go func() { _ = s.Serve(l) }()
	_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"base": "http://" + l.Addr().String(), "token": d.token, "revision": revision})
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	select {
	case <-signals:
	case <-time.After(180 * time.Second):
	}
	_ = s.Close()
	d.mu.Lock()
	defer d.mu.Unlock()
	proof := []observation{}
	failed := false
	for id := range d.runs {
		e := d.p.Stop(id)
		o, oe := d.observe(id)
		if e != nil || oe != nil || !o.Exited {
			failed = true
		}
		proof = append(proof, o)
	}
	_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"cleanup": true, "failed": failed, "creates": d.creates, "observations": proof})
	if failed {
		os.Exit(1)
	}
}
