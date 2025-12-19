from enum import Enum

class State(Enum):
    PROCESSING = 'PROCESSING'
    COMPLETED = 'COMPLETED',
    REPLAYED = 'REPLAYED'
    QUEUE = 'QUEUE'
    ERROR = 'ERROR'