
const interestRate = 0.05;    // 每天利率

// 5 % 分配给推荐人，5 % 给平台开发者 5 % 作为市场宣传费用
const refRate = 0.05;
const secondRefRate = 0.03; // 3 % 分配给二级推荐人
const thirdRefRate = 0.02; // 2 % 分配给三级推荐人
const promoteRate = 0.05;

const minDeposit = 10;

const contractTeam = "iostblb"; // 开发者账户  
const contractPromote = "iostblb"; // 推广账户  

const minutesPerDay = 24 * 60;//一天多少分钟

const depositNum = 256;     // 最多存入256条记录

const NS_PER_SECOND = 1000000000;                   // 每秒纳秒数
const MINUTE_PER_DAY = 24 * 60; // 第天分钟数
const NS_PER_MINUTE = NS_PER_SECOND * 60;   // 每分钟纳秒数
const maxCheckDur = 28;            // 28天

const REF_AMOUNT_KEY = "refAmount:";
const REF_ALL_AMOUNT_KEY = "refAllAmount:";
const SWITCH_KEY = "SwitchKey"; // 总开关的key
const TIME_SWITCH_KEY = "TimeSwitchKey"; // 时间开关的key

const ACC_KEY_INDEX_KEY = "AccKIndex:";     // key的索引
const ACC_FIELD_INDEX_KEY = "AccFIndex:";   // field的索引
const ACC_EXISTS_KEY = "EAcc:";             // 账户是否存取过

class LuckyBet {


    init() {
    }

    _requireAuth(account, permission) {
        const ret = blockchain.requireAuth(account, permission);
        if (ret !== true) {
            throw new Error("require auth failed. ret = " + ret);
        }
    }

    _storeAccInfo(account, nFieldIndex, obj) {
        storage.mapPut(account, this._normalizeFieldIndex(nFieldIndex), JSON.stringify(obj));
    }

    _findReffer(account, reffer) {
        if (storage.has(account)) {
            return storage.get(account);
        } else {
            return reffer;
        }
    }

    _normalizeFieldIndex(fieldIndex) {

        // fieldIndex = Number(fieldIndex);
        // if ( isNaN(fieldIndex) ) {
        //     fieldIndex = 0;
        // }
        // if ( fieldIndex < 10 ) {
        //     fieldIndex = "00" + fieldIndex;
        // } else if ( fieldIndex < 100 ) {
        //     fieldIndex = "0" + fieldIndex;
        // } else {
        //     fieldIndex = "" + fieldIndex;
        // }
        var type = (typeof fieldIndex);
        if( type == "number"){
            return fieldIndex.toFixed(0);
        }
        else if(type == "string"){
            return fieldIndex;
        }
    }

    _getRealReffer(account, reffer) {

        // 查找有没有前次记录的推荐人
        reffer = this._findReffer(account, reffer);

        // 默认的推荐人是owner
        if (reffer == "" || reffer == account) {
            reffer = contractTeam; //blockchain.contractOwner();
        }

        if (!storage.has(account)) { // 存储上一次推荐人，只能第一次存储，不能修改
            if (reffer != contractTeam) {
                storage.put(account, reffer);
            }
        }

        return reffer;
    }

    // 查找合适nFieldIndex位置存储数据
    _findFieldIndex(account) {
        // 存入记录
        if (storage.mapLen(account) >= depositNum) {
            throw "deposit record overflow. limit <= 256";
        }

        var tField = storage.mapKeys(account);
        var tFieldKeyFlag = [];

        for (var fieldKey in tField) {
            var realFieldKey = Number(fieldKey);
            tFieldKeyFlag[realFieldKey] = true;
        }

        var nFieldIndex = -1;
        for (var i = 0; i < depositNum; i++) {
            if (tFieldKeyFlag[i] != true) {
                nFieldIndex = i;
                break;
            }
        }

        if (nFieldIndex == -1)
            throw "algorithm error. nFieldIndex error";

        return nFieldIndex;

    }

    _storeIncreaseInfo(key, step) {

        var bExists = storage.has(key);

        var strRefNum;

        if (bExists == false) {
            strRefNum = "" + step;
        } else {
            strRefNum = storage.get(key);
            var nRefNum = Number(strRefNum);
            if (isNaN(nRefNum)) {
                nRefNum = 0;
            }
            strRefNum = "" + (nRefNum + step);
        }
        storage.put(key, strRefNum);
    }

    _getIncreaseInfo(key) {
        var bExists = storage.has(key);
        var nNum = 0;    // 推荐的人数,即奖励
        if (bExists) {
            nNum = Number(storage.get(key));
        }
        return nNum;
    }

    // 将推荐的人数加1
    _increaseRefNum(reffer, refAmount) {
        this._storeIncreaseInfo("Ref:" + reffer, 1);
        this._storeIncreaseInfo(REF_AMOUNT_KEY + reffer, refAmount);
    }

    // 存储用户的账户信息
    _storeAcc(account) {

        // 已经存储了
        var bExists = storage.has(ACC_EXISTS_KEY + account);
        if (bExists) {
            return;
        }

        var nKeyIndex = this._getIncreaseInfo(ACC_KEY_INDEX_KEY);
        var nFieldIndex = this._getIncreaseInfo(ACC_FIELD_INDEX_KEY);

        const MAX_KEY_INDEX = 100;

        if (nKeyIndex > MAX_KEY_INDEX) {
            // 不存储
            return;
        }

        storage.mapPut(ACC_KEY_INDEX_KEY + nKeyIndex, this._normalizeFieldIndex(nFieldIndex), account);

        nFieldIndex++;
        if (nFieldIndex >= 255) {
            nKeyIndex++;
            nFieldIndex = 0;
        }
        
        storage.put(ACC_KEY_INDEX_KEY, "" + nKeyIndex);
        storage.put(ACC_FIELD_INDEX_KEY, "" + nFieldIndex);

        storage.put(ACC_EXISTS_KEY + account, "1");

    }

    getStoreAcc() {
        var nKeyIndex = this._getIncreaseInfo(ACC_KEY_INDEX_KEY);
        var nFieldIndex = this._getIncreaseInfo(ACC_FIELD_INDEX_KEY);

        var nAccNum = nKeyIndex * 255 + nFieldIndex;

        return {
            nKeyIndex,
            nFieldIndex,
            nAccNum
        }

    }

    /**
     * 存入
     *
     * @String account => 转账方
     * @String amount => 存入金额
     * @string reffer => 推荐人
     * 
     */
    deposit(account, amount, reffer) {

        var now = block.time;
        this._checkAllSwitch(now);
        var nAmount = Number(amount);
        if (isNaN(nAmount)) {
            throw "amount is not number"
        }

        // 预防负数与最小的存入数
        if (nAmount < minDeposit) {
            throw "amount is less than " + minDeposit;
        }
        amount = nAmount.toFixed(4);

        reffer = this._getRealReffer(account, reffer);
        blockchain.call("token.iost", "transfer", ["iost", account, blockchain.contractName(), amount, "LuckyDeposit|" + reffer]); //owner

        var nFieldIndex = this._findFieldIndex(account);
        var obj = {
            reffer: reffer, // 推荐人
            deposit: nAmount, // 存入总额
            depositTime: now, // 存入时间
            interestTime: now, // 利息结算起始时间
            balance: 0, // 当前已经结算的余额
        }

        this._storeAccInfo(account, nFieldIndex, obj);

        var nRewardBalance;

        // 5 % 分配给一级推荐人
        nRewardBalance = (Number(amount) * refRate).toFixed(4);
        blockchain.callWithAuth("token.iost", "transfer", ["iost", blockchain.contractName(), reffer, nRewardBalance, "LuckyDeposit|reward for inviting"]); //owner

        // 将推荐人数加1
        this._increaseRefNum(reffer, Number(nRewardBalance));
        this._storeIncreaseInfo(REF_ALL_AMOUNT_KEY, Number(nRewardBalance)); // 总推荐金额

        // 3 % 分配给二级推荐人
        var secondReffer = this._findReffer(reffer, contractTeam);
        nRewardBalance = (Number(amount) * secondRefRate).toFixed(4);
        blockchain.callWithAuth("token.iost", "transfer", ["iost", blockchain.contractName(), secondReffer, nRewardBalance, "LuckyDeposit|reward for second inviting"]);

        // 将推荐人数加1
        this._increaseRefNum(secondReffer, Number(nRewardBalance));
        this._storeIncreaseInfo(REF_ALL_AMOUNT_KEY, Number(nRewardBalance)); // 总推荐金额

        // 2 % 分配给三级推荐人
        var thirdReffer = this._findReffer(secondReffer, contractTeam);
        nRewardBalance = (Number(amount) * thirdRefRate).toFixed(4);
        blockchain.callWithAuth("token.iost", "transfer", ["iost", blockchain.contractName(), thirdReffer, nRewardBalance, "LuckyDeposit|reward for third inviting"]);

        // 将推荐人数加1
        this._increaseRefNum(thirdReffer, Number(nRewardBalance));
        this._storeIncreaseInfo(REF_ALL_AMOUNT_KEY, Number(nRewardBalance)); // 总推荐金额

        // 5%市场宣传费用
        nRewardBalance = (Number(amount) * promoteRate).toFixed(4);
        blockchain.callWithAuth("token.iost", "transfer", ["iost", blockchain.contractName(), contractPromote, nRewardBalance, "LuckyDeposit|reward for promotion"]);

        this._storeAcc(account);

        return "LuckyBet.deposit success";

    }


    // 结算利息
    _checkInterest(account, now) { //, nAmount

        var tField = storage.mapKeys(account);

        var totalInterest = 0;

        var nRemoveNum = 0;
        for (var fieldKey in tField) {
            var obj = JSON.parse(storage.mapGet(account, fieldKey));
            var bRemove4Db = false;
            var deposit = obj.deposit;

            var endPoint = obj.depositTime + maxCheckDur * MINUTE_PER_DAY * NS_PER_MINUTE; // 截止时间点
            if (now >= endPoint) { // 
                bRemove4Db = true;
                nRemoveNum++;
            } else {
                endPoint = now;
            }

            var durMin = Math.floor((endPoint - obj.interestTime) / NS_PER_MINUTE); // 分钟 block.time的单位是ns
            var durDay = Math.floor(durMin / minutesPerDay);
            var durMinRemain = durMin - durDay * minutesPerDay;

            var interest = 0;
            if (durDay > 0)
                interest += Number((deposit * interestRate * durDay).toFixed(4)); // 多少天的利息
            interest += Number((deposit * interestRate * (durMinRemain / MINUTE_PER_DAY)).toFixed(4)); // 多少分钟利息

            // 结掉之前的利息
            obj.balance = obj.balance + interest;
            obj.interestTime = now; // 更新存入时间

            if (bRemove4Db) {
                // 移走过期并提现的记录
                //storage.mapDel(account, fieldKey);
            } else {
                storage.mapPut(account, this._normalizeFieldIndex(fieldKey), JSON.stringify(obj));
            }

            totalInterest += interest;
        }

        if (totalInterest <= 0) {
            throw "LuckyDeposit|checkInterest totalInterest is not enough"
        }

        return totalInterest;
    }


    /**
     * 提现
     *  
     * @String account => 提现账户
     *
     */
    withdraw(account) {

        var now = block.time;
        this._checkAllSwitch(now);

        var nWithdraw = this._checkInterest(account, now);

        var amountOwner = blockchain.call("token.iost", "balanceOf", ["iost", blockchain.contractName()]);

        if (Number(amountOwner) <= nWithdraw) {
            // 崩盘了关闭掉总开关
            nWithdraw = Number(amountOwner);
            this._setSwitch(false);
        }

        blockchain.callWithAuth("token.iost", "transfer", ["iost", blockchain.contractName(), account, nWithdraw.toFixed(4), "LuckyDeposit|withdraw"]);

        return "LuckyBet.withDraw success";

    }


    getAccList(nStartIndex, nEndIndex) {

        this._requireAuth(blockchain.contractOwner(), "active");
        return this._getAccList(nStartIndex, nEndIndex);
    }

    /**
     * 
     * @param {Number} nStartIndex 
     * @param {Number} nEndIndex 
     */
    _getAccList(nStartIndex, nEndIndex) {

        if (nStartIndex < 0 || nStartIndex >= 100)
            throw "nStartIndex must between 0 and 99";
        if (nEndIndex < 0 || nEndIndex >= 100)
            throw "nEndIndex must between 0 and 99";

        var tAcc = [];
        for (var nKeyIndex = nStartIndex; nKeyIndex <= nEndIndex; nKeyIndex++) {
            var key = ACC_KEY_INDEX_KEY + nKeyIndex;
            
            var tField = storage.mapKeys(key);

            if ( tField != null ) {
                for (var fieldKey in tField) {
                    var strAcc = storage.mapGet(key, fieldKey);
                    if ( strAcc != null && strAcc != "" )
                        tAcc.push(strAcc);    
                }
            }
        }

        return tAcc;

    }


    _setSwitch(bSwitch) {
        storage.put(SWITCH_KEY, "" + bSwitch);
    }

    setSwitch(bSwitch) {

        this._requireAuth(blockchain.contractOwner(), "active");
        this._setSwitch(bSwitch);
    }

    _getSwitch4Db() {
        var bSwitch = false;
        if (storage.has(SWITCH_KEY)) {
            if (storage.get(SWITCH_KEY) == "true") {
                bSwitch = true;
            }
        }
        return bSwitch;
    }

    /**
     * 设置多少时间后才能开始存款
     * @param {Number} nTimeSwitch 秒数
     */
    setTimeSwitch(nTimeSwitch) {

        this._requireAuth(blockchain.contractOwner(), "active");
        var now = block.time;
        now += (NS_PER_SECOND * nTimeSwitch);
        storage.put(TIME_SWITCH_KEY, "" + now);

    }

    checkAllSwitch() {
        this._checkAllSwitch(block.time);
    }

    _checkAllSwitch(now) {

        if (this._getSwitch4Db() == false) {
            throw "switch is off. 总开关处于关闭状态"
        }

        // 判断时间开关
        if (storage.has(TIME_SWITCH_KEY)) {
            var nTimeSwitch = Number(storage.get(TIME_SWITCH_KEY));
            if (nTimeSwitch > now) {
                throw "timeswitch is not deadline. 时间开关未开启 timeswitch=>" + nTimeSwitch + " now=>" + now;
            }
        } else {
            throw "timeswitch is not deadline. 时间开关未存储";
        }

    }

    /**
     * 取得时间开关跟总开关
     */
    getSwitch() {

        this._requireAuth(blockchain.contractOwner(), "active");
        var now = block.time;
        var bSwitch = this._getSwitch4Db();

        var nTimeSwitch = 0;
        var nTimeDiff = 0;

        if (storage.has(TIME_SWITCH_KEY)) {
            nTimeSwitch = Number(storage.get(TIME_SWITCH_KEY));
            nTimeDiff = Math.floor((nTimeSwitch - now) / NS_PER_SECOND);
        }

        return {
            bSwitch,
            nTimeSwitch,
            now,
            nTimeDiff
        }

    }

    can_update(data) {
        return blockchain.requireAuth(blockchain.contractOwner(), "active");
    }

}


module.exports = LuckyBet;
