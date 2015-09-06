# this script is used to build the centos library on top of vagrant
# it supports the company's build system.

# it assumes it is running from a different folder than it is committed to.
# the expected structure is
# root
#   +---- script.sh (will be copied here from jenkins)
#   +---- cloudify-ui - the cloudify ui repository
#   +---- vagrant-config - holds configuration for vagrant
#   +---- vagrant-automation-machines - holds the vagrantfile

set -e
set -v

echoerr() { echo "$@" 1>&2; }

echo "user is $USER";


mkdir -p /tmp/automations

CLOUD=aws

DIR=`pwd`
VAM="$DIR/vagrant-automation-machines"
SOURCES="$DIR/cloudify-grafana"
VCONFIG="$DIR/vagrant-config"

#### Read credentials passed to us from company's build system

JENKINS_CREDENTIALS_FILE="${JENKINS_HOME}/jobs/credentials.sh"

if [ -f ${JENKINS_CREDENTIALS_FILE} ]; then

     echo "credentials.sh exists. overriding parameters.."

     echo "copying file to override"
     cp -f $VCONFIG/official-build-config.json config.json #copy original file

     echo "reading properties from provision.sh"
     source $SOURCES/build/jenkins/provision.sh



     export CONFIG_FILE=`pwd`/config.json

     echo "reading credentials from jenkins hom"
     source ${JENKINS_CREDENTIALS_FILE}


    ## todo: read provision.sh from correct position.

    export BUCKET_NAME="gigaspaces-repository-eu"
    AWS_S3_BUCKET_PATH="org/cloudify3/${VERSION}/${PRERELEASE}-RELEASE"

     # now there should be 2 system environment files available
     # AWS_ACCESS_KEY_ID_UPLOAD_TEMP
     # AWS_ACCESS_KEY_UPLOAD_TEMP

     ## lets replace everything from overrides
     echo "overriding aws access key id"
     sed -i.bak s/__S3_ACCESS_KEY__/$AWS_ACCESS_KEY_ID_UPLOAD_TEMP/g $CONFIG_FILE

     echo "overriding aws token"
     ## use other character in sed rather than / because aws tokens have / which messes things up
     ##
     sed -i.bak s#__S3_SECRET_KEY__#$AWS_ACCESS_KEY_UPLOAD_TEMP#g $CONFIG_FILE

     echo "overriding bucket"
     sed -i.bak s/__S3_BUCKET__/$BUCKET_NAME/g $CONFIG_FILE


     echo "overriding bucket path"
     sed -i.bak s#__S3_FOLDER__#$AWS_S3_BUCKET_PATH#g $CONFIG_FILE


     echo "overriding version"
     sed -i.bak s/__VERSION__/$VERSION/g $CONFIG_FILE
     echo "overriding prerelease"
     sed -i.bak s/__PRERELEASE__/$PRERELEASE/g $CONFIG_FILE
     echo "overriding build"
     sed -i.bak s/__BUILD__/$BUILD/g $CONFIG_FILE
     echo "overriding tag"
     sed -i.bak s/__TAG__/$CORE_TAG_NAME/g $CONFIG_FILE

     echo "overriding github username"
     sed -i.bak s/__GITHUB_USERNAME__/$GITHUB_USERNAME/g $CONFIG_FILE
     echo "overriding github token"
     sed -i.bak s/__GITHUB_TOKEN__/$GITHUB_PASSWORD/g $CONFIG_FILE


else
    echo "file [${JENKINS_CREDENTIALS_FILE}] is not present. skipping..."
    export CONFIG_FILE=$VCONFIG/centos-build-config.json
fi



chmod 600 $VCONFIG/centos-ireland-keyfile.pem
cp -f $VCONFIG/centos-ireland-keyfile.pem /tmp/automations/centos-cloudify-ui-build.pem

cp -Rf $SOURCES/build/vagrant/* $VAM/

if [ -e ~/.vagrant_$CLOUD ]; then
    echo "declaring new vagrant home"
    export VAGRANT_HOME="~/.vagrant_$CLOUD"
else
    echo "assuming pluging installed in default vagrant home"
fi

cd $VAM/$CLOUD

echo "I am at [`pwd`] and I am about to run vagrant up with CLOUD=$CLOUD"

cat Vagrantfile
vagrant plugin list

echo "and this is my configuration file [$CONFIG_FILE]"
cat $CONFIG_FILE


FAILED="false"
vagrant destroy -f || echo "no need to teardown the machine because it was not running"

vagrant up --provider=$CLOUD || FAILED="true"

# copy the file
SCP_PLUGIN=`vagrant plugin list | grep vagrant-scp | wc -l`

if [ "$SCP_PLUGIN" = "0" ]; then
    echoerr "need vagrant-scp plugin which is missing"
	exit 1
else
    echo "scp plugin already installed"
fi

echo "cleaning old reports"
REPORTS_PARENT_DIR="../.."
rm -rf $REPORTS_PARENT_DIR/reports
vagrant scp default:reports $REPORTS_PARENT_DIR


vagrant destroy -f || echo "could not tear down the machine"

if [ "$FAILED" = "true" ];then
    failed is true so I write here something that will cause the build to fail
fi




