import { LabStatus } from "../../enums/lab-status.enum";
import { SimpleFormData, RadioQuestion } from "../simple-form-data.model";
import { StoredObject } from "../stored-object.model";
import { Team } from "../team.model";
import { DockerServiceInfo } from "./docker-service-info.model";
import { Lab } from "./lab.model";
import { ProxmoxVM } from "./proxmox-vm.model";
import { RemoteServer } from "./remote-server.model";

export class LabTracker extends StoredObject {
  labStarted?: Lab;
  labStatus?: LabStatus;
  labOwner?: Team;
  services?: DockerServiceInfo[];
  vms?: ProxmoxVM[];
  remoteServer?: RemoteServer;

  constructor(serverResult?: any) {
    if (serverResult) {
      super(serverResult);

      this.labStarted = serverResult.labStarted;
      this.labStatus = serverResult.labStatus;
      this.labOwner = serverResult.labOwner;
      this.services = serverResult.services ?? [];
      this.vms = serverResult.vms ?? [];
      this.remoteServer = serverResult.remoteServer;
    }
  }
}

export class LabTrackerServicesForm extends SimpleFormData {
  constructor(
    updateResultsCB: Function = (k: any, v: any) => { },
    services?: DockerServiceInfo[],
    labTracker?: LabTracker
  ) {
    super('labTrackerServicesForm');

    this.preFilledData = new Map<string, string>([
    ]);

    this.questions.push(
      new RadioQuestion({
        label: 'Service',
        key: 'service',
        options: services!.map((service: DockerServiceInfo) => ({ key: service.name.replace(labTracker!.id + "-", ""), value: service.name, disabled: false })),
      }),
    );
    this.questions.forEach((e) => (e.cb = updateResultsCB));
  }
}
