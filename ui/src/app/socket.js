
import {
    updateForm, updateUI, removeProxy, clearForm,
    updateProxies, removeNetwork, updateNetworks,
    removeService, updateServices, updateCloud, updateEdges,
} from "../app/store";

import ReconnectingWebSocket from 'reconnecting-websocket';


export default class PlaygroundSocket {

    constructor(playground, address) {
        const {api, store} = playground;
        this.playground = playground;
        this.address = address;
        this.ws = new ReconnectingWebSocket(address);
        this.store = store;
        this.api = api;
        this.addListeners();
        this._state = 'starting';
        this.disconnected = false;
    }

    get listeners () {
        return {
            message: this.onMessage,
            close: this.onDisconnect,
            open: this.onConnect};
    }

    addListeners () {
        for (const [_event, handler] of Object.entries(this.listeners)) {
            this.ws.addEventListener(_event, event => {
                handler(event);
            });
        }
    }

    refreshIcons = async () => {
        const {dispatch} = this.store;
        const {network, service, proxy} = this.store.getState();
        await dispatch(updateCloud({
            services: service.value,
            proxies: proxy.value,
            networks: network.value,
        }));
        await dispatch(updateEdges({
            proxies: proxy.value,
        }));
    }

    onConnect = async (evt) => {
        const {dispatch} = this.store;
        if (this.disconnected) {
            await dispatch(updateUI({toast: null}));
            await this.playground.load();
        }
    };

    onDisconnect = async (evt) => {
        // todo: check Reason to prevent onload firing
        const {target} = evt;
        const {dispatch} = this.store;
        if (target._shouldReconnect) {
            this.disconnected = true;
            await dispatch(updateUI({toast: 'socket-disconnected'}));
        }
    };

    onMessage = async (event) => {
        const {dispatch} = this.store;
        const eventData = JSON.parse(event.data);
        // console.log("INCOMING", eventData);
        if (eventData.playtime_errors) {
            await dispatch(updateUI({
                toast: 'errors',
                errors: eventData.playtime_errors}));
            return;
        }
        if (eventData.type === "network") {
            if (eventData.action === "destroy") {
                await dispatch(removeNetwork(eventData.id));
                this.refreshIcons();
            } else if (eventData.action === "create") {
                await dispatch(updateNetworks(eventData));
                await dispatch(updateUI({modal: null}));
                await dispatch(clearForm());
                this.refreshIcons();
            } else if (eventData.action === "connect" || eventData.action === "disconnect") {
                const {service, proxy} = this.store.getState();
                await dispatch(updateNetworks({
                    services: service.value,
                    proxies: proxy.value,
                    ...eventData}));
                await this.refreshIcons();
            }
        } else if (eventData.type === "container") {
            if (eventData.resource === "proxy") {
                const form = this.store.getState().form.value;
                const {name: formName} = form;
                const {id, name, port_mappings, image, status, logs} = eventData;
                const proxies = {};
                if (status === "creating") {
                    proxies[name] = {name};
                    await dispatch(updateProxies({proxies}));
                    this.refreshIcons();
                    if (formName && formName === name) {
                        await dispatch(updateForm({status}));
                    }
                } else if (eventData.status === "start") {
                    proxies[name] = {name, id, image};
                    if (port_mappings) {
                        proxies[name].port_mappings = port_mappings;
                    }
                    await dispatch(updateProxies({proxies}));
                    this.refreshIcons();
                    if (formName && formName === name) {
                        await dispatch(updateForm({status}));
                    }
                } else if (eventData.status === "exited") {
                    await dispatch(removeProxy(eventData.id));
                    await this.refreshIcons();
                    if (formName && formName === name) {
                        await dispatch(updateForm({status}));
                    }
                } else if (eventData.status === "destroy") {
                    await dispatch(removeProxy(eventData.id));
                    await this.refreshIcons();
                    if (formName && formName === name) {
                        await dispatch(updateForm({status}));
                    }
                } else if (eventData.status === "die") {
                    await dispatch(removeProxy(eventData.id));
                    await this.refreshIcons();
                    if (formName && formName === eventData.name) {
                        await dispatch(updateForm({status, logs}));
                    }
                } else {
                    // console.log("UNHANDLED INCOMING", eventData);
                }
            } else {
                const form = this.store.getState().form.value;
                const {service_type, name: formName} = form;
                const {id, name, image, status, logs} = eventData;
                const services = {};
                if (status === "creating") {
                    services[name] = {name, service_type};
                    await dispatch(updateServices({services}));
                    await this.refreshIcons();
                    if (formName && formName === name) {
                        await dispatch(updateForm({status}));
                    }
                } else if (eventData.status === "start") {
                    services[name] = {name, id, image, service_type};
                    await dispatch(updateServices({services}));
                    await this.refreshIcons();
                    if (formName && formName === name) {
                        await dispatch(updateForm({status}));
                    }
                } else if (eventData.status === "exited") {
                    await dispatch(removeService(eventData.id));
                    await this.refreshIcons();
                    if (formName && formName === name) {
                        await dispatch(updateForm({status}));
                    }
                } else if (eventData.status === "destroy") {
                    await dispatch(removeService(eventData.id));
                    await this.refreshIcons();
                    if (formName && formName === name) {
                        await dispatch(updateForm({status}));
                    }
                } else if (eventData.status === "die") {
                    await dispatch(removeService(eventData.id));
                    await this.refreshIcons();
                    if (formName && formName === eventData.name) {
                        await dispatch(updateForm({status, logs}));
                    }
                } else {
                    // console.log("UNHANDLED INCOMING", eventData);
                }
            }
        }
    }
}
