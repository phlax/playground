# -*- coding: utf-8 -*-

import logging
import pkg_resources
from functools import cached_property
from typing import Type, Union

import attr

import rapidjson as json  # type: ignore

from aiohttp import web

from playground.control.attribs import (
    NetworkAddAttribs, NetworkDeleteAttribs, NetworkEditAttribs,
    ProxyAddAttribs, ContainerDeleteAttribs,
    ServiceAddAttribs, ServiceTransmitAttribs,
    ProxyTransmitAttribs, NetworkTransmitAttribs, ValidatingAttribs)
from playground.control.constants import (
    MIN_NAME_LENGTH, MAX_NAME_LENGTH,
    MIN_CONFIG_LENGTH, MAX_CONFIG_LENGTH,
    MAX_NETWORK_CONNECTIONS)
from playground.control.connectors.docker.client import PlaygroundDockerClient
from playground.control.decorators import api, transmit, method_decorator
from playground.control.event import PlaygroundEvent
from playground.control.request import PlaygroundRequest
from playground.control.api.handler import PlaygroundEventHandler
from playground.control.services import PlaygroundServiceDiscovery


logger = logging.getLogger(__name__)


class PlaygroundAPI(object):

    def __init__(self, services: Union[tuple, None] = None):
        self._sockets: list = []
        self.connector = PlaygroundDockerClient(self)
        self.handler = PlaygroundEventHandler(self)
        self.services = PlaygroundServiceDiscovery(services)

    @cached_property
    def metadata(self):
        return dict(
            title='Envoy playground',
            version=pkg_resources.require("playground.control")[0].version,
            repository='https://github.com/envoyproxy/playground',
            max_network_connections=MAX_NETWORK_CONNECTIONS,
            min_name_length=MIN_NAME_LENGTH,
            max_name_length=MAX_NAME_LENGTH,
            min_config_length=MIN_CONFIG_LENGTH,
            max_config_length=MAX_CONFIG_LENGTH)

    @method_decorator(api)
    async def clear(self, request: PlaygroundRequest) -> None:
        await self.connector.clear()

    @method_decorator(api)
    async def dump_resources(self, request: PlaygroundRequest) -> dict:
        response = await self.connector.dump_resources()
        response.update(
            dict(meta=self.metadata,
                 service_types=self.services.types))
        return response

    async def events(self, request: web.Request) -> None:
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        self.subscribe(ws)
        try:
            while True:
                await ws.receive()
        except RuntimeError as e:
            # todo: handle this better ?
            print(e)
        # always ?
        finally:
            self.unsubscribe(ws)

    async def listen(self, app: web.Application) -> None:
        self.handler.subscribe(self.connector)

    def subscribe(self, ws: web.WebSocketResponse) -> None:
        self._sockets.append(ws)

    def unsubscribe(self, ws: web.WebSocketResponse) -> None:
        self._sockets.remove(ws)

    @method_decorator(api(attribs=NetworkAddAttribs))
    async def network_add(self, request: PlaygroundRequest) -> None:
        await request.validate(self)
        await self.connector.networks.create(attr.asdict(request.data))

    @method_decorator(api(attribs=NetworkDeleteAttribs))
    async def network_delete(self, request: PlaygroundRequest) -> None:
        await request.validate(self)
        await self.connector.networks.delete(attr.asdict(request.data))

    @method_decorator(api(attribs=NetworkEditAttribs))
    async def network_edit(self, request: PlaygroundRequest) -> None:
        await request.validate(self)
        await self.connector.networks.edit(attr.asdict(request.data))

    @method_decorator(api(attribs=ProxyAddAttribs))
    async def proxy_add(self, request: PlaygroundRequest) -> None:
        await request.validate(self)
        await self.connector.proxies.create(attr.asdict(request.data))

    @method_decorator(api(attribs=ContainerDeleteAttribs))
    async def proxy_delete(self, request: PlaygroundRequest) -> None:
        await request.validate(self)
        await self.connector.proxies.delete(attr.asdict(request.data))

    async def publish(
            self,
            data: dict) -> None:
        logger.debug(f'Publish {data}')
        for socket in self._sockets:
            await socket.send_json(data, dumps=json.dumps)

    async def _publish(
            self,
            kind: str,
            data: Type[ValidatingAttribs]) -> None:
        _data = attr.asdict(data)
        _data['type'] = kind
        await self.publish(_data)

    @method_decorator(transmit(attribs=NetworkTransmitAttribs))
    async def publish_network(
            self,
            event: PlaygroundEvent) -> None:
        await self._publish('network', event.data)

    @method_decorator(transmit(attribs=ProxyTransmitAttribs))
    async def publish_proxy(
            self,
            event: PlaygroundEvent) -> None:
        await self._publish('proxy', event.data)

    @method_decorator(transmit(attribs=ServiceTransmitAttribs))
    async def publish_service(
            self,
            event: PlaygroundEvent) -> None:
        await self._publish('service', event.data)

    @method_decorator(api(attribs=ServiceAddAttribs))
    async def service_add(self, request: PlaygroundRequest) -> None:
        await request.validate(self)
        command = attr.asdict(request.data)
        service_config = self.services.types[command['service_type']]
        command['image'] = service_config.get("image")
        if command.get('configuration'):
            command['config_path'] = service_config['labels'].get(
                'envoy.playground.config.path')
        await self.connector.services.create(command)

    @method_decorator(api(attribs=ContainerDeleteAttribs))
    async def service_delete(self, request: PlaygroundRequest) -> None:
        await request.validate(self)
        await self.connector.services.delete(attr.asdict(request.data))
