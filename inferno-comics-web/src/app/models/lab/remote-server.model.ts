import { ServerType } from '../../enums/server-type.enum';
import { SimpleFormData, RadioQuestion, TextQuestion, NumberQuestion, PasswordQuestion, ButtonQuestion, ObservableMap, DropDownQuestion } from '../simple-form-data.model';
import { StoredObject } from '../stored-object.model';
import { RemoteServerStats } from './remote-server-stats.model';

export class RemoteServer extends StoredObject {
  name?: string;
  ipAddress?: string;
  port?: number;
  serverType?: ServerType;
  remoteServerStats?: RemoteServerStats;
  nodeName?: string;

  constructor(serverResult?: any) {
    super(serverResult);
    if (serverResult) {
      this.name = serverResult.name;
      this.ipAddress = serverResult.ipAddress;
      this.port = serverResult.port;
      this.serverType = serverResult.serverType;
      this.remoteServerStats = serverResult.remoteServerStats ? new RemoteServerStats(serverResult.remoteServerStats) : undefined;
      this.nodeName = serverResult.nodeName;
    }
  }
}

export class RemoteServerFormData extends SimpleFormData {
  validated?: boolean = false;
  constructor(
    updateResultsCB: Function = (k: any, v: any) => { }
  ) {
    super('remoteServer');

    this.preFilledData = new Map<string, string>([
    ]);

    this.questions.push(
      new RadioQuestion({
        label: 'Server Type',
        key: 'serverType',
        options: Object.values(ServerType).filter((e) => e !== ServerType.UNKNOWN).map(value => ({ key: value, value: value, disabled: false })),
        neededEnum: { key: 'serverType', value: Object.values(ServerType) },
      }),
      new TextQuestion({
        label: 'Name',
        key: 'name',
        neededEnum: { key: 'serverType', value: Object.values(ServerType) }
      }),
      new TextQuestion({
        label: 'IPAddress',
        key: 'ipAddress',
        neededEnum: { key: 'serverType', value: Object.values(ServerType) }
      }),
      new NumberQuestion({
        label: 'Port',
        key: 'port',
        neededEnum: { key: "serverType", value: [ServerType.DOCKER_HOST] }
      }),
      new TextQuestion({
        label: "Username",
        key: "username",
        neededEnum: { key: "serverType", value: [ServerType.DOCKER_HOST] }
      }),
      new PasswordQuestion({
        label: "Password",
        key: "password",
        neededEnum: { key: "serverType", value: [ServerType.DOCKER_HOST] }
      }),
      new TextQuestion({
        label: "API Token",
        key: "apiToken",
        neededEnum: { key: "serverType", value: [ServerType.PROXMOX] },
        hint: "TOKEN_ID=SECRET",
        size: 100
      }, true),
      new TextQuestion({
        label: "Node Name",
        key: "nodeName",
        neededEnum: { key: "serverType", value: [ServerType.PROXMOX] }
      }, true),
      new ButtonQuestion({
        label: "Validate",
        key: "validate",
        dataBoolean: false,
        neededEnum: { key: 'serverType', value: [ServerType.DOCKER_HOST, ServerType.PROXMOX] },
        action: (func: () => void) => {
          if (!func) return;
          func();
          console.log('func called')
        }
      }),
    );
    this.questions.forEach((e) => (e.cb = updateResultsCB));
  }
}

export class RemoteServerSelectData extends SimpleFormData {
  constructor(observables?: ObservableMap) {
    super('remoteServerSelect');

    this.questions.push(
      new DropDownQuestion({
        label: 'Remote Server',
        key: 'remoteServer',
        options: [],
        asyncData:
          observables && observables['remoteServer']
            ? observables['remoteServer']
            : undefined,
      })
    );
  }
}
