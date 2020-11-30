
from collections import OrderedDict

import aiodocker

from playground.control.connectors.docker.events import (
    PlaygroundDockerEvents)
from playground.control.connectors.docker.images import (
    PlaygroundDockerImages)
from playground.control.connectors.docker.networks import (
    PlaygroundDockerNetworks)
from playground.control.connectors.docker.proxies import (
    PlaygroundDockerProxies)
from playground.control.connectors.docker.services import (
    PlaygroundDockerServices)
from playground.control.connectors.docker.volumes import (
    PlaygroundDockerVolumes)
from playground.control.decorators import cmd, method_decorator


class PlaygroundDockerClient(object):
    _envoy_label = "envoy.playground"

    def __init__(self):
        self.docker = aiodocker.Docker()
        self.images = PlaygroundDockerImages(self)
        self.volumes = PlaygroundDockerVolumes(self)
        self.proxies = PlaygroundDockerProxies(self)
        self.services = PlaygroundDockerServices(self)
        self.networks = PlaygroundDockerNetworks(self)
        self.events = PlaygroundDockerEvents(self.docker)

    @method_decorator(cmd)
    async def clear(self) -> None:
        await self.networks.clear()
        await self.proxies.clear()
        await self.services.clear()

    @method_decorator(cmd(sync=True))
    async def dump_resources(self) -> list:
        proxies = OrderedDict()
        for proxy in await self.proxies.list():
            proxies[proxy["name"]] = proxy

        networks = OrderedDict()
        for network in await self.networks.list():
            networks[network["name"]] = network

        services = OrderedDict()
        for service in await self.services.list():
            services[service["name"]] = service
        return dict(
            networks=networks,
            proxies=proxies,
            services=services)

    async def get_container(self, id: str):
        return await self.docker.containers.get(id)

    async def get_network(self, id: str):
        return await self.docker.networks.get(id)
