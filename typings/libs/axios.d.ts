declare module 'axios' {
    import Axios from 'node_modules/axios/index';

    // const axios = Axios;
    export default Axios;

    export {AxiosResponse} from 'node_modules/axios/index';
}