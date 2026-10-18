/** Per-file ordering with task barriers. A queued control closes admission
 * immediately; it drains earlier data before pause/cancel may release resources. */
export class TransferScheduler {
    jobs = new Map();
    state(id) {
        let state = this.jobs.get(id);
        if (!state) {
            state = { control: Promise.resolve(), controls: 0, generation: 0, files: new Map() };
            this.jobs.set(id, state);
        }
        return state;
    }
    control(id, action, stopQueued = false) {
        const state = this.state(id);
        state.controls++;
        if (stopQueued)
            state.generation++;
        const pending = Promise.allSettled([state.control, ...state.files.values()]).then(action);
        state.control = pending;
        void pending.finally(() => { state.controls--; if (!state.controls && !state.files.size)
            this.jobs.delete(id); }).catch(() => { });
        return pending;
    }
    file(id, index, action) {
        const state = this.state(id);
        const generation = state.generation;
        const pending = Promise.allSettled([state.control, state.files.get(index)]).then(() => {
            if (generation !== state.generation)
                throw new Error('传输排队请求已取消，未发送到远端。');
            return action();
        });
        state.files.set(index, pending);
        void pending.finally(() => {
            if (state.files.get(index) === pending)
                state.files.delete(index);
            if (!state.controls && !state.files.size)
                this.jobs.delete(id);
        }).catch(() => { });
        return pending;
    }
}
//# sourceMappingURL=transfer-scheduler.js.map