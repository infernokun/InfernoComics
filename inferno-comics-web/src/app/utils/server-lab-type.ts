import { LabType } from '../enums/lab-type.enum';
import { ServerType } from '../enums/server-type.enum';

export function getServerType(labType: LabType): ServerType {
  if (
    [
      LabType.DOCKER_COMPOSE,
      LabType.DOCKER_CONTAINER,
      LabType.KUBERNETES,
    ].includes(labType)
  ) {
    return ServerType.DOCKER_HOST;
  } else if ([LabType.VIRTUAL_MACHINE].includes(labType)) {
    return ServerType.PROXMOX;
  } else {
    return ServerType.UNKNOWN;
  }
}
