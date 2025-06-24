export class ProxmoxVM {
  name?: string;
  vmid?: number;
  status?: string;
  uptime?: number;
  mem?: number;
  maxmem?: number;
  cpu?: number;
  cpus?: number;
  template?: boolean;

  constructor(serverResult?: any) {
    if (serverResult) {
      this.name = serverResult.name;
      this.vmid = serverResult.vmid;
      this.status = serverResult.status;
      this.uptime = serverResult.uptime;
      this.mem = serverResult.mem;
      this.maxmem = serverResult.maxmem;
      this.cpu = serverResult.cpu;
      this.cpus = serverResult.cpus;
      this.template = serverResult.template;
    }
  }
}
