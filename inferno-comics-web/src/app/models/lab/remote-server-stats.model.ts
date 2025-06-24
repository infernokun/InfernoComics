import { LabStatus } from '../../enums/lab-status.enum';
import { StoredObject } from '../stored-object.model';
import { RemoteServer } from './remote-server.model';

export class RemoteServerStats extends StoredObject {
  hostname?: string;
  osName?: string;
  osVersion?: string;
  totalRam?: number; // as float in Java, using number here.
  availableRam?: number;
  usedRam?: number;
  cpu?: number;
  cpuUsagePercent?: number;
  totalDiskSpace?: number;
  availableDiskSpace?: number;
  usedDiskSpace?: number;
  uptime?: number;
  status?: LabStatus;
  remoteServer?: RemoteServer;

  constructor(serverResult?: any) {
    super(serverResult);
    if (serverResult) {
      this.hostname = serverResult.hostname;
      this.osName = serverResult.osName;
      this.osVersion = serverResult.osVersion;
      this.totalRam = serverResult.totalRam;
      this.availableRam = serverResult.availableRam;
      this.usedRam = serverResult.usedRam;
      this.cpu = serverResult.cpu;
      this.cpuUsagePercent = serverResult.cpuUsagePercent;
      this.totalDiskSpace = serverResult.totalDiskSpace;
      this.availableDiskSpace = serverResult.availableDiskSpace;
      this.usedDiskSpace = serverResult.usedDiskSpace;
      this.uptime = serverResult.uptime;
      this.status = serverResult.status;
      // If the remoteServer property is provided in the response,
      // instantiate the RemoteServer model.
      this.remoteServer = serverResult.remoteServer ? new RemoteServer(serverResult.remoteServer) : undefined;
    }
  }
}
