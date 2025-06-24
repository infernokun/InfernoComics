export class DockerServiceInfo {
  name: string = 'unknown';
  state: string = 'unknown';
  ports: string[] = [];
  volumes: Map<string, string>[] = [];
  ipAddresses: string[] = [];
  networks: string[] = [];

  constructor(serverResult?: any) {
    if (serverResult) {
      this.name = serverResult.name;
      this.state = serverResult.state;
      this.ports = serverResult.ports;
      this.volumes = serverResult.volumes;
      this.ipAddresses = serverResult.ipAddresses;
      this.networks = serverResult.networks;
    }
  }
}
