import Conf from 'conf';

interface ConfigSchema {
  deviceCode?: string;
  accessToken?: string;
  refreshToken?: string;
  serverUrl?: string;
}

const config = new Conf<ConfigSchema>({
  projectName: 'termote',
  defaults: {}
});

export default config;
