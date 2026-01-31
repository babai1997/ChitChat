import { useSocketContext } from '../contexts/SocketContextShared';

export const useSocket = () => {
  return useSocketContext();
};
