import BlueLinky from './index';
import EventEmitter from 'events';
import { endpoints, GEN1, GEN2} from './constants';
import got from 'got';
import { buildFormData } from './util';

import {
  StartConfig,
  HyundaiResponse,
  VehicleConfig,
  VehicleStatus
} from './interfaces';

import logger from './logger';

export default class Vehicle extends EventEmitter {
  private vin: string|null;
  private pin: string|null;
  private bluelinky: BlueLinky;
  private currentFeatures: object;
  private gen: number = 2;
  private regId: string|null = null;
  private isElectric: boolean = false;

  constructor(config: VehicleConfig) {
    super();
    this.vin = config.vin;
    this.pin = config.pin;
    this.bluelinky = config.bluelinky;
    this.currentFeatures = {};

    this.onInit();
  }

  addFeature(featureName, state) {
    this.currentFeatures[featureName] = (state === 'ON' ? true : false);
  }

  async onInit() {
    const response = await this.features();

    if(response!.result === 'E:Failure' ||  response!.result !== undefined) {
      response!.result.forEach(item => {
        logger.debug(JSON.stringify(item));
        this.addFeature(item.featureName, item.featureStatus);
      });
    }

    const ownerInfo = await this.ownerInfo();
    if (ownerInfo !== null) {
      const vehicle = ownerInfo.result.OwnersVehiclesInfo.find(item => this.vin === item.VinNumber);

      // hard code list of EVs for now
      this.isElectric = [1532].includes(vehicle.ModelID);
      logger.info(`modelId ${vehicle.ModelID}`);
      logger.info(`isElectric ${this.isElectric.toString()}`);

      this.gen = vehicle.IsGen2;
      this.regId = vehicle.RegistrationID;
      logger.debug(`registering a gen ${this.gen} vehicle (${this.regId})`);
    }

    // we tell the vehicle it's loaded :D
    this.emit('ready');
  }

  getVinNumber(): string|null {
    return this.vin;
  }

  hasFeature(featureName: string): boolean {
    return this.currentFeatures[featureName];
  }

  getFeatures(): object {
    return this.currentFeatures;
  }

  async unlock(): Promise<HyundaiResponse|null> {

    if(!this.hasFeature('DOOR UNLOCK')) {
      throw new Error('Vehicle does not have the unlock feature');
    }

    const formData = {
      service: 'remoteunlock'
    };

    const response = await this._request(endpoints.remoteAction, formData);

    return {
      result: response.RESPONSE_STRING,
      status: response.E_IFRESULT,
      errorMessage: response.E_IFFAILMSG
    };
  }

  async lock(): Promise<HyundaiResponse|null> {

    if(!this.hasFeature('DOOR LOCK')) {
      throw new Error('Vehicle does not have the lock feature');
    }

    const response = await this._request(endpoints.remoteAction, {
      service: 'remotelock'
    });

    return {
      result: response.RESPONSE_STRING,
      status: response.E_IFRESULT,
      errorMessage: response.E_IFFAILMSG
    };
  }

  async start(config: StartConfig): Promise<HyundaiResponse|null> {

    // if(!this.hasFeature('REMOTE START')) {
    //   throw new Error('Vehicle does not have the remote start feature');
    // }

    const defaultConfig = {
      airCtrl: true,
      igniOnDuration: 10,
      airTempvalue: 70,
      defrost: false,
      heating1: false,
      seatHeaterVentInfo: {
        drvSeatHeatState: '2'
      }
    }
    const mergedConfig = { ...defaultConfig, ...config };

    const service = this.isElectric ? 'postRemoteFatcStart' : 'ignitionstart';
    const response = await this._request(endpoints.remoteAction, {
      service: service,
      ...mergedConfig
    });

    return {
      result: response.RESPONSE_STRING,
      status: response.E_IFRESULT,
      errorMessage: response.E_IFFAILMSG
    };
  }

  async stop(): Promise<HyundaiResponse|null> {

    // if(!this.hasFeature('REMOTE STOP')) {
    //   throw new Error('Vehicle does not have the remote stop feature');
    // }

    const service = this.isElectric ? 'postRemoteFatcStop' : 'ignitionstop';
    const response = await this._request(endpoints.remoteAction, {
      service
    });

    return {
      result: response.RESPONSE_STRING,
      status: response.E_IFRESULT,
      errorMessage: response.E_IFFAILMSG
    };
  }

  async flashLights(): Promise<HyundaiResponse|null> {

    if(!this.hasFeature('LIGHTS ONLY')) {
      throw new Error('Vehicle does not have the flash lights feature');
    }

    const response = await this._request(endpoints.remoteAction, {
      service: 'light'
    });

    return {
      result: response.RESPONSE_STRING,
      status: response.E_IFRESULT,
      errorMessage: response.E_IFFAILMSG
    };
  }

  async panic(): Promise<HyundaiResponse|null> {

    if(!this.hasFeature('HORN AND LIGHTS')) {
      throw new Error('Vehicle does not have the panic feature');
    }

    const response = await this._request(endpoints.remoteAction, {
      service: 'horn'
    });

    return {
      result: response.RESPONSE_STRING,
      status: response.E_IFRESULT,
      errorMessage: response.E_IFFAILMSG
    };
  }

  async health(): Promise<HyundaiResponse|null> {

    const response = await this._request(endpoints.health, {
      service: 'getRecMaintenanceTimeline'
    });

    return {
      result: response.RESPONSE_STRING,
      status: response.E_IFRESULT,
      errorMessage: response.E_IFFAILMSG
    };

  }

  async apiUsageStatus(): Promise<HyundaiResponse|null> {

    const response = await this._request(endpoints.usageStats,  {
      startdate: 20140401, // TODO: make these paramters
      enddate: 20190611, // TODO: make these paramters
      service: 'getUsageStats'
    });

    return {
      result: response.RESPONSE_STRING.OUT_DATA,
      status: response.E_IFRESULT,
      errorMessage: response.E_IFFAILMSG
    };
  }

  async messages(): Promise<HyundaiResponse|null> {

    const response = await this._request(endpoints.messageCenter, {
      service: 'messagecenterservices'
    });

    return {
      result: response.RESPONSE_STRING.results,
      status: response.E_IFRESULT,
      errorMessage: response.E_IFFAILMSG
    };
  }

  async accountInfo(): Promise<HyundaiResponse|null> {

    const response = await this._request(endpoints.myAccount,  {
      service: 'getOwnerInfoDashboard'
    });

    return {
      result: response.RESPONSE_STRING,
      status: response.E_IFRESULT,
      errorMessage: response.E_IFFAILMSG
    };
  }

  async ownerInfo(): Promise<HyundaiResponse|null> {

    const response = await this._request(endpoints.myAccount,  {
      service: 'getOwnerInfoService'
    });

    return {
      result: response.RESPONSE_STRING,
      status: response.E_IFRESULT,
      errorMessage: response.E_IFFAILMSG
    };
  }

  async features(): Promise<HyundaiResponse|null> {

    const response = await this._request(endpoints.enrollmentStatus,  {
      service: 'getEnrollment'
    });

    return {
      result: response.FEATURE_DETAILS.featureDetails,
      status: response.E_IFRESULT,
      errorMessage: response.E_IFFAILMSG
    };
  }

  async serviceInfo(): Promise<HyundaiResponse|null> {

    const response = await this._request(endpoints.myAccount, {
      service: 'getOwnersVehiclesInfoService'
    });

    return {
      result: response.OwnerInfo,
      status: response.E_IFRESULT,
      errorMessage: response.E_IFFAILMSG
    };
  }

  async pinStatus(): Promise<HyundaiResponse|null> {

    const response = await this._request(endpoints.myAccount, {
      service: 'getpinstatus'
    });

    return {
      result: response.RESPONSE_STRING,
      status: response.E_IFRESULT,
      errorMessage: response.E_IFFAILMSG
    };

  }

  async subscriptionStatus(): Promise<HyundaiResponse|null> {

    const response = await this._request(endpoints.subscriptions, {
      service: 'getproductCatalogDetails'
    });

    return {
      result: response.RESPONSE_STRING.OUT_DATA.PRODUCTCATALOG,
      status: response.E_IFRESULT,
      errorMessage: response.E_IFFAILMSG
    };
  }

  async status(refresh: boolean = false): Promise<VehicleStatus|null> {

    if (this.gen === GEN1) {
      throw new Error('Status feature is not supported on gen 1 vehicles :(');
    }

    const response = await this._request(endpoints.status,  {
      services: 'getVehicleStatus', // THIS IS WHAT HAPPENS WHEN YOU MAKE A PRO TYPO.... services (plural)
      refresh: refresh // I think this forces the their API to connect to the vehicle and pull the status
    });

    return response.RESPONSE_STRING.vehicleStatus;

  }

  private async _request(endpoint, data): Promise<any|null> {
    logger.debug(`[${endpoint}] ${JSON.stringify(data)}`);

    // handle token refresh if we need to
    await this.bluelinky.handleTokenRefresh();

    const formData = buildFormData({
      vin: this.vin,
      username: this.bluelinky.username,
      pin: this.pin,
      url: 'https://owners.hyundaiusa.com/us/en/page/dashboard.html',
      token: this.bluelinky.getAccessToken(),
      gen: this.gen,
      regId: this.regId,
      ...data
    });

    const response = await got(endpoint, {
      method: 'POST',
      body: formData,
    });

    logger.debug(JSON.stringify(response.body));

    if (response.body.includes('PIN Locked')) {
      throw new Error('PIN is locked, please correct the isssue before trying again.');
    }

    try {
      return JSON.parse(response.body);
    } catch (e) {
      return response.body;
    }
  }
}
